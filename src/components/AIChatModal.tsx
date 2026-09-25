import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  MessageSquare,
  Send,
  Bot,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Groq } from "groq-sdk";
import { supabase } from "../services/supabaseClient";
import { useAuth } from "../contexts/AuthContext";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessageType {
  id: string;
  content: string;
  sender: "user" | "bot";
  timestamp: Date;
}

interface AIChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole?: string; // kept for backward-compat; internally we use useAuth
}

interface ShopContext {
  services: any[];
  parts: any[];
  shops: any[];
  loadedAt: string;
}

interface CustomerContext {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  vehicles: {
    id: string;
    make: string;
    model: string;
    year: number;
  }[];
  recentAppointments: {
    service_type: string;
    status: string;
    scheduled_date: string;
  }[];
}

// ─── Supabase Fetchers ──────────────────────────────────────────────────────────

async function fetchShopContext(shopId?: string): Promise<ShopContext> {
  const [servicesRes, partsRes, shopsRes] = await Promise.allSettled([
    (() => {
      let q = supabase
        .from("products")
        .select("name, description, unit_price, category")
        .order("unit_price");
      if (shopId) q = q.eq("shop_id", shopId);
      return q;
    })(),
    (() => {
      let q = supabase
        .from("parts")
        .select("name, category, quantity_in_stock, unit_price")
        .gt("quantity_in_stock", 0)
        .order("category");
      if (shopId) q = q.eq("shop_id", shopId);
      return q;
    })(),
    (() => {
      return supabase
        .from("shops")
        .select(
          "id, name, slug, description, address, city, specialties, operating_hours, phone",
        )
        .eq("is_active", true)
        .order("name");
    })(),
  ]);

  return {
    services:
      servicesRes.status === "fulfilled" ? (servicesRes.value.data ?? []) : [],
    parts: partsRes.status === "fulfilled" ? (partsRes.value.data ?? []) : [],
    shops:
      shopsRes.status === "fulfilled" ? (shopsRes.value.data ?? []) : [],
    loadedAt: new Date().toLocaleTimeString("en-PH"),
  };
}

async function fetchCustomerContext(
  userId: string,
): Promise<CustomerContext | null> {
  try {
    const { data: userData } = await supabase
      .from("users")
      .select("id, name, email, phone, address")
      .eq("id", userId)
      .single();
    if (!userData) return null;

    const { data: vehicles } = await supabase
      .from("vehicles")
      .select("id, make, model, year")
      .eq("customer_id", userId);

    const { data: appointments } = await supabase
      .from("appointments")
      .select("booking_id, service_type, status, scheduled_date")
      .eq("customer_id", userId)
      .order("scheduled_date", { ascending: false })
      .limit(5);

    return {
      id: userData.id,
      userId: userData.id,
      name: userData.name,
      email: userData.email ?? "",
      phone: userData.phone ?? null,
      address: userData.address ?? null,
      vehicles: vehicles ?? [],
      recentAppointments: appointments ?? [],
    };
  } catch {
    return null;
  }
}

// ─── Guardrail & Refusal Config ─────────────────────────────────────────────

export const FRIENDLY_PIVOT_REFUSAL =
  "I'm here as your MotoLink assistant! While I can't help with that topic, I'd love to help you with our services, check parts inventory, or help you find the best MotoLink shop for your motorcycle. What can I do for you today?";

// Client-side pre-filter to catch obvious non-motorcycle queries instantly and save API tokens
const NON_MOTORCYCLE_KEYWORDS = /\b(cooking|recipe|adobo|food|programming|python|react|javascript|code|movie|actor|crypto|bitcoin|election|politics|nba|football|homework|essay)\b/i;

export const isOffTopicQuery = (query: string): boolean => {
  return NON_MOTORCYCLE_KEYWORDS.test(query);
};

// ─── System Prompt Builder ──────────────────────────────────────────────────────

function buildSystemPrompt(
  ctx: ShopContext,
  customer: CustomerContext | null,
): string {
  const today = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Services Block
  const servicesBlock =
    ctx.services.length > 0
      ? ctx.services
          .map(
            (s) =>
              `- **${s.name}**: ₱${Number(s.unit_price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}${s.description ? ` — ${s.description}` : ""}`,
          )
          .join("\n")
      : "No services listed currently. Please invite the customer to call the shop.";

  // Parts Block
  const partsByCategory: Record<string, any[]> = {};
  for (const p of ctx.parts) {
    const cat = p.category ?? "other";
    if (!partsByCategory[cat]) partsByCategory[cat] = [];
    partsByCategory[cat].push(p);
  }
  const partsBlock =
    ctx.parts.length > 0
      ? Object.entries(partsByCategory)
          .map(
            ([cat, items]) =>
              `**${cat.toUpperCase()}**:\n` +
              items
                .map(
                  (p) =>
                    `  - ${p.name}: ₱${Number(p.unit_price).toLocaleString("en-PH", { minimumFractionDigits: 2 })} (In Stock)`,
                )
                .join("\n"),
          )
          .join("\n")
      : "No parts listed currently.";

  // Shops Block
  const shopsBlock =
    ctx.shops.length > 0
      ? ctx.shops
          .map(
            (s) =>
              `- **${s.name}** — ${s.city ?? "N/A"}${s.specialties ? ` | Specialties: ${s.specialties}` : ""}${s.operating_hours ? ` | Hours: ${s.operating_hours}` : ""}${s.description ? ` | ${s.description}` : ""}`,
          )
          .join("\n")
      : "No shops listed on the MotoLink directory.";

  // Customer Context Block
  let customerBlock = "";
  if (customer) {
    const vehicleList =
      customer.vehicles.length > 0
        ? customer.vehicles
            .map((v) => `  - ${v.year} ${v.make} ${v.model}`)
            .join("\n")
        : "  - No registered vehicles yet.";

    const apptList =
      customer.recentAppointments.length > 0
        ? customer.recentAppointments
            .map(
              (a) =>
                `  - ${a.service_type} | ${a.status} | ${new Date(a.scheduled_date).toLocaleDateString("en-PH")}`,
            )
            .join("\n")
        : "  - No recent appointments.";

    customerBlock = `
=== LOGGED-IN CUSTOMER PROFILE ===
Customer Name: ${customer.name}
Email: ${customer.email}
Phone: ${customer.phone ?? "Not provided"}
Registered Vehicles:
${vehicleList}
Recent Appointments:
${apptList}`;
  }

  return `YOU ARE MOTOMECH AI — THE WARM, POLITE, AND HELPFUL VIRTUAL RECEPTIONIST FOR THE MOTOLINK MOTOR SHOP DIRECTORY. You help customers find the best MotoLink shop for their motorcycle needs.
Today is ${today}. Live shop data loaded at ${ctx.loadedAt}.

=== SHOP DATA CONTEXT ===
<shop_services>
${servicesBlock}
</shop_services>

<parts_inventory>
${partsBlock}
</parts_inventory>

<shop_recommendations>
${shopsBlock}
</shop_recommendations>
${customerBlock}

=== PERSONA & TONE ===
- Speak as a welcoming, enthusiastic, and polite shop receptionist.
${customer ? `- Greet the customer by their first name (${customer.name.split(" ")[0]}) to make them feel at home.` : "- Be warm and hospitable to guest customers, encouraging them to explore shop services."}
- Use clear bullet points and bold formatting for pricing and service details. Always use Philippine Peso (₱).
- Appointments are always booked with a MotoLink SHOP. NEVER mention mechanics, mechanic availability, or book/recommend a specific mechanic.

=== SCOPE & PERMITTED TOPICS ===
1. PERMITTED TOPICS:
   - MotoLink shop services, pricing, parts availability, store hours, and location.
   - Recommending the best MotoLink shop for a customer's motorcycle problem or need.
   - Motorcycle maintenance advice, symptom diagnostics, riding safety tips, and vehicle-part compatibility.
   - Polite greetings and light small talk.
2. STRICTLY FORBIDDEN TOPICS:
   - Non-motorcycle topics (cooking/recipes, software programming, news, politics, sports, general trivia).
   - Mechanics: their identities, availability, schedules, or booking a specific mechanic. If a customer asks to book a mechanic or see a mechanic's schedule, respond with the best matching MotoLink SHOP and THAT SHOP's operating hours and booking details instead.

=== FRIENDLY PIVOT REFUSAL INSTRUCTION ===
If a customer asks a question completely unrelated to motorcycles or shop business, respond politely with EXACTLY this sentence:
"${FRIENDLY_PIVOT_REFUSAL}"

=== CONVERSATIONAL BOOKING & RESERVATION GUIDANCE ===
When a customer expresses interest in a service or part:
- Encourage them to book an appointment with a MotoLink SHOP: "Would you like me to guide you on how to book this service with [shop name]?" or "We have this part in stock! You can reserve it or visit the recommended shop to have it installed."
- Always tie bookings to a shop, never to a mechanic.

=== SHOP RECOMMENDATION GUIDANCE ===
When a customer describes a motorcycle problem, a service need, or asks which shop is best:
- Match their need against each shop's specialties, city/proximity, and services in <shop_recommendations>.
- Show ALL matching shops clearly (name + city) with one line each so the customer can compare, then recommend the best 1-2 with reasons.
- If the customer mentions their area, prioritize shops in that city.
- If no shop clearly matches, suggest the closest shop and invite them to call for details.
- If a customer wants to book a mechanic or asks about a mechanic's schedule: do NOT give mechanic info. Recommend the best matching MotoLink shop, share THAT SHOP's operating hours from <shop_recommendations>, and guide them on booking an appointment at that shop.

=== MANDATORY FOLLOW-UP SECTION ===
At the VERY END of EVERY response, you MUST include a section titled:
You might also want to ask:
• [Short follow-up question 1]?
• [Short follow-up question 2]?
• [Short follow-up question 3]?
(Keep follow-up questions short, under 60 characters, each starting with "•" and ending with a question mark "?").`;
}

// ─── Component ──────────────────────────────────────────────────────────────────

const AIChatModal: React.FC<AIChatModalProps> = ({ isOpen, onClose }) => {
  const { user, isAuthenticated } = useAuth();

  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [shopCtx, setShopCtx] = useState<ShopContext | null>(null);
  const [customerCtx, setCustomerCtx] = useState<CustomerContext | null>(null);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const groqClient = useRef<Groq | null>(null);

  // Derive greeting based on login state
  const buildGreeting = (
    customer: CustomerContext | null,
  ): ChatMessageType => ({
    id: "initial",
    sender: "bot",
    timestamp: new Date(),
    content: customer
      ? `Hello, ${customer.name.split(" ")[0]}! I'm MotoMech AI, your MotoLink assistant.\n\nI can see you have ${customer.vehicles.length > 0 ? customer.vehicles.map((v) => `a ${v.year} ${v.make} ${v.model}`).join(" and ") : "no registered vehicles yet"}. How can I help you today?\n\n- Service info and pricing\n- Parts availability\n- Best shop recommendations`
      : `Hello! I'm MotoMech AI, MotoLink's 24/7 assistant. How can I help you today?\n\n- Service info and pricing\n- Parts availability and recommendations\n- Best shop recommendations\n\nTip: Log in for a faster booking experience!`,
  });

  // Init Groq
  useEffect(() => {
    try {
      // @ts-ignore
      const apiKey = import.meta.env.VITE_GROQ_API_KEY as string;
      if (!apiKey || apiKey === "your_groq_api_key_here") {
        setError("Groq API key not configured.");
        return;
      }
      groqClient.current = new Groq({ apiKey, dangerouslyAllowBrowser: true });
    } catch {
      setError("Failed to initialize AI client.");
    }
  }, []);

  // Load all context when modal opens
  const loadContext = useCallback(async () => {
    setCtxLoading(true);
    try {
      const [shop, customer] = await Promise.all([
        fetchShopContext(user?.shop_id),
        isAuthenticated && user?.id && user.role === "customer"
          ? fetchCustomerContext(user.id)
          : Promise.resolve(null),
      ]);

      setShopCtx(shop);
      setCustomerCtx(customer);

      // Restore previous conversation if one exists; otherwise seed a greeting
      const storageKey = `motolink_ai_chat_${user?.id ?? "guest"}`;
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(
              parsed.map((m: any) => ({
                ...m,
                timestamp: new Date(m.timestamp),
              })),
            );
            return;
          }
        } catch {
          // corrupted storage → fall through to greeting
        }
      }
      setMessages([buildGreeting(customer)]);
    } catch {
      setMessages([buildGreeting(null)]);
    } finally {
      setCtxLoading(false);
    }
  }, [isAuthenticated, user?.id, user?.role]);

  // Persist the conversation so it survives closing / re-opening the chat
  useEffect(() => {
    const storageKey = `motolink_ai_chat_${user?.id ?? "guest"}`;
    if (messages.length > 0) {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    }
  }, [messages, user?.id]);

  useEffect(() => {
    if (isOpen) loadContext();
  }, [isOpen, loadContext]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Helper: parse follow-up suggestions from bot response
  const parseSuggestions = (content: string): string[] => {
    const lines = content.split("\n");
    const suggestions: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      // Match lines starting with •, -, or numbered like 1.
      const match = trimmed.match(/^(?:[•\-\*]|\d+[\.\)])\s*(.+)/);
      if (match && match[1]) {
        const text = match[1]
          .replace(/^["']|["']$/g, "")
          .replace(/\*+/g, "")
          .trim();
        // Only treat short lines as suggestions (< 80 chars, likely follow-up questions)
        if (text.length > 5 && text.length < 80 && text.endsWith("?")) {
          suggestions.push(text);
        }
      }
    }
    // Return only the last 2-3 suggestions (the follow-up ones)
    return suggestions.slice(-3);
  };

  // Reusable: send a text message to the AI
  const sendMessageFromText = async (text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText || !groqClient.current || loading) return;
    if (error) return;

    // 1. Client-side guardrail check for blatant non-motorcycle queries
    if (isOffTopicQuery(trimmedText)) {
      const userMsg: ChatMessageType = {
        id: Date.now().toString(),
        content: trimmedText,
        sender: "user",
        timestamp: new Date(),
      };
      const botRefusal: ChatMessageType = {
        id: (Date.now() + 1).toString(),
        content: FRIENDLY_PIVOT_REFUSAL,
        sender: "bot",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg, botRefusal]);
      setInput("");
      return;
    }

    const userMessage: ChatMessageType = {
      id: Date.now().toString(),
      content: trimmedText,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => {
      const newMessages = [...prev, userMessage];
      setInput("");
      setLoading(true);

      (async () => {
        try {
          const systemPrompt = shopCtx
            ? buildSystemPrompt(shopCtx, customerCtx)
            : `You are MotoMech AI, receptionist for MotoLink. The database is loading. Advise the customer to wait a moment or visit the shop.`;
          const history = newMessages
            .filter((m) => m.id !== "initial")
            .map((m) => ({
              role: (m.sender === "user" ? "user" : "assistant") as
                | "user"
                | "assistant",
              content: m.content,
            }));
          const response = await groqClient.current!.chat.completions.create({
            model: "openai/gpt-oss-120b",
            messages: [{ role: "system", content: systemPrompt }, ...history],
            max_tokens: 1024,
            temperature: 0.3, // Temperature 0.3 strictly adheres to refusal rules while keeping tone warm
          });
          const raw =
            response.choices[0]?.message?.content ??
            "I couldn't generate a response. Please try again or contact our shop!";
          setMessages((p) => [
            ...p,
            {
              id: (Date.now() + 1).toString(),
              content: raw,
              sender: "bot",
              timestamp: new Date(),
            },
          ]);
        } catch {
          setMessages((p) => [
            ...p,
            {
              id: (Date.now() + 1).toString(),
              content: "Something went wrong, please try again.",
              sender: "bot",
              timestamp: new Date(),
            },
          ]);
        } finally {
          setLoading(false);
        }
      })();
      return newMessages;
    });
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    await sendMessageFromText(input);
  };

  const isLoggedInCustomer = isAuthenticated && user?.role === "customer";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          className="ai-chat fixed bottom-4 right-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-moto-gray bg-moto-darker shadow-2xl shadow-black/60 w-[clamp(320px,40vw,620px)] max-w-[94vw] h-[clamp(420px,80vh,820px)]"
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-moto-gray bg-moto-dark/90 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-moto-accent to-moto-accent-dark flex items-center justify-center shadow-lg shadow-moto-accent/20">
                  <MessageSquare
                    size={18}
                    className="text-slate-950"
                    strokeWidth={2}
                  />
                </div>
                {/* Online indicator */}
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-moto-dark" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="chat-title text-slate-100 font-bold tracking-wide truncate">
                    Motolink AI
                  </p>
                  {ctxLoading ? (
                    <Loader2 size={11} className="text-moto-accent animate-spin shrink-0" />
                  ) : (
                    <span className="chat-text-xs text-green-400 font-bold tracking-widest uppercase shrink-0">
                      ● Active
                    </span>
                  )}
                </div>
                <p className="chat-text-xs text-slate-500 font-bold tracking-[0.16em] uppercase truncate">
                  {isLoggedInCustomer && customerCtx
                    ? `Hi, ${customerCtx.name.split(" ")[0]}`
                    : "AI Assistant"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {error ? (
                <span title={error}>
                  <AlertCircle size={14} className="text-yellow-400" />
                </span>
              ) : (
                <span
                  title="Refresh data"
                  onClick={loadContext}
                  className="p-1.5 rounded-full text-slate-500 hover:text-moto-accent hover:bg-moto-gray/40 transition cursor-pointer"
                >
                  <RefreshCw size={13} />
                </span>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-moto-gray/40 transition"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* ── Error Banner ── */}
          {error && (
            <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-2.5 flex items-center gap-2 text-red-400 text-[10px] font-bold tracking-widest uppercase flex-shrink-0">
              <AlertCircle size={12} />
              <span className="truncate">{error}</span>
            </div>
          )}

          {/* ── Messages ── */}
          <div className="chat-scroll flex-1 px-3.5 py-4 bg-moto-darker space-y-4">
            {messages.map((message, idx) => {
              const isLastBotMsg =
                message.sender === "bot" && idx === messages.length - 1;
              const inlineSuggestions =
                message.sender === "bot" && isLastBotMsg && !loading
                  ? parseSuggestions(message.content)
                  : [];
              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col ${message.sender === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl ${
                      message.sender === "user"
                        ? "bg-moto-accent text-slate-950 rounded-br-md"
                        : "bg-moto-dark border border-moto-gray text-slate-200 rounded-bl-md"
                    }`}
                  >
                    <p
                      className={`chat-text whitespace-pre-wrap ${
                        message.sender === "user" ? "font-semibold" : "font-medium"
                      }`}
                    >
                      {message.content}
                    </p>
                    <p
                      className={`chat-text-xs mt-1.5 ${message.sender === "user" ? "text-slate-900/60" : "text-slate-500"}`}
                    >
                      {message.timestamp.toLocaleTimeString("en-PH", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {/* Inline follow-up suggestion buttons */}
                  {inlineSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {inlineSuggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => sendMessageFromText(s)}
                          disabled={loading}
                          className="chat-chip px-3 py-1.5 font-bold tracking-wider uppercase rounded-full border border-moto-accent/40 text-moto-accent hover:bg-moto-accent hover:text-slate-950 transition-colors disabled:opacity-30"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}

            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="bg-moto-dark border border-moto-gray px-3.5 py-3 rounded-2xl rounded-bl-md flex items-center gap-2">
                  <Bot size={14} className="text-moto-accent" />
                  <div className="flex gap-1">
                    <motion.div
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ duration: 0.6, repeat: Infinity }}
                      className="w-1.5 h-1.5 bg-moto-accent rounded-full"
                    />
                    <motion.div
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }}
                      className="w-1.5 h-1.5 bg-moto-accent rounded-full"
                    />
                    <motion.div
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }}
                      className="w-1.5 h-1.5 bg-moto-accent rounded-full"
                    />
                  </div>
                  <span className="chat-text-xs uppercase tracking-widest font-bold text-slate-500">
                    THINKING
                  </span>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Quick chips ── */}
          <div className="px-3.5 pt-3 pb-1.5 bg-moto-darker border-t border-moto-gray/50 flex-shrink-0">
            <div className="flex flex-wrap gap-1.5">
              {(isLoggedInCustomer && customerCtx?.vehicles.length
                ? [
                    "What services do you offer?",
                    "Which MotoLink shop is best for my motorcycle?",
                    `Check parts for my ${customerCtx.vehicles[0].make}`,
                  ]
                : [
                    "What services do you offer?",
                    "Which MotoLink shop should I visit?",
                  ]
              ).map((chip) => (
                <button
                  key={chip}
                  onClick={() => sendMessageFromText(chip)}
                  disabled={loading}
                  className="chat-chip px-3 py-1.5 font-bold tracking-wider uppercase rounded-full border border-moto-gray text-slate-400 hover:border-moto-accent hover:text-moto-accent transition-colors disabled:opacity-30 truncate max-w-[200px]"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* ── Input ── */}
          <div className="px-3.5 py-3 bg-moto-dark border-t border-moto-gray flex-shrink-0">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !loading && handleSendMessage()
                }
                placeholder={
                  error
                    ? "FIX API KEY TO CHAT..."
                    : isLoggedInCustomer
                      ? `Ask me anything, ${customerCtx?.name.split(" ")[0] ?? ""}...`
                      : "ASK ABOUT SERVICES, PARTS, SCHEDULES..."
                }
                disabled={loading || !!error}
                className="chat-input flex-1 bg-moto-darker text-slate-100 px-4 py-2.5 rounded-full border border-moto-gray focus:border-moto-accent focus:outline-none transition font-medium disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-slate-500"
              />
              <button
                onClick={handleSendMessage}
                disabled={loading || !input.trim() || !!error}
                className="w-10 h-10 shrink-0 rounded-full bg-moto-accent hover:bg-moto-accent-dark disabled:bg-moto-gray disabled:text-slate-500 text-slate-950 flex items-center justify-center transition-colors disabled:cursor-not-allowed shadow-lg shadow-moto-accent/20"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AIChatModal;