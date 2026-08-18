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
  mechanics: any[];
  availability: any[];
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
  const [servicesRes, partsRes, mechanicsRes, availRes] =
    await Promise.allSettled([
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
        let q = supabase.from("users").select("id, name, phone").eq("role", "mechanic");
        if (shopId) q = q.eq("shop_id", shopId);
        return q;
      })(),
      (() => {
        let q = supabase
          .from("mechanic_availability")
          .select("mechanic_id, day_of_week, start_time, end_time, is_available")
          .eq("is_available", true);
        if (shopId) q = q.eq("shop_id", shopId);
        return q;
      })(),
    ]);

  return {
    services:
      servicesRes.status === "fulfilled" ? (servicesRes.value.data ?? []) : [],
    parts: partsRes.status === "fulfilled" ? (partsRes.value.data ?? []) : [],
    mechanics:
      mechanicsRes.status === "fulfilled"
        ? (mechanicsRes.value.data ?? [])
        : [],
    availability:
      availRes.status === "fulfilled" ? (availRes.value.data ?? []) : [],
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
      .select("service_type, status, scheduled_date")
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

  // --- Shop data blocks ---
  const servicesBlock =
    ctx.services.length > 0
      ? ctx.services
          .map(
            (s) =>
              `- ${s.name}: PHP ${Number(s.unit_price).toFixed(2)}${s.description ? ` — ${s.description}` : ""}`,
          )
          .join("\n")
      : "No services listed. Advise customer to call the shop.";

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
              `${cat.toUpperCase()}:\n` +
              items
                .map(
                  (p) =>
                    `  - ${p.name}: PHP ${Number(p.unit_price).toFixed(2)} (In Stock)`,
                )
                .join("\n"),
          )
          .join("\n")
      : "No parts listed. Advise customer to visit the shop.";

  const mechanicsBlock =
    ctx.mechanics.length > 0
      ? ctx.mechanics
          .map((m) => {
            const sched = ctx.availability
              .filter((a) => a.mechanic_id === m.id)
              .map((a) => `${a.day_of_week}: ${a.start_time}–${a.end_time}`)
              .join(", ");
            return `- ${m.name}${m.phone ? ` (${m.phone})` : ""}${sched ? ` | Schedule: ${sched}` : ""}`;
          })
          .join("\n")
      : "No mechanics listed.";

  // --- Customer context block ---
  let customerBlock = "";
  if (customer) {
    const vehicleList =
      customer.vehicles.length > 0
        ? customer.vehicles
            .map((v) => `  - ${v.year} ${v.make} ${v.model}`)
            .join("\n")
        : "  - No vehicles registered yet.";

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
=== LOGGED-IN CUSTOMER (use this to personalize) ===
Name: ${customer.name}
Email: ${customer.email}
Phone: ${customer.phone ?? "not provided"}
Address: ${customer.address ?? "not provided"}
Registered Vehicles:
${vehicleList}
Recent Appointments:
${apptList}`;
  }

  return `You are Motolink AI, the 24/7 virtual assistant for Motolink.
Today is ${today}. Live shop data loaded at ${ctx.loadedAt}.

=== SHOP SERVICES ===
${servicesBlock}

=== PARTS IN STOCK ===
${partsBlock}

=== MECHANICS & AVAILABILITY ===
${mechanicsBlock}
${customerBlock}

=== YOUR ROLE ===
You are a helpful, professional, and friendly shop assistant.
- Use ONLY the data above to answer questions. NEVER invent prices, schedules, or availability.
- When a customer describes a vehicle problem, suggest relevant parts from the list above.
- Always recommend visiting or calling the shop for complex issues.
- If data lists are empty, honestly say so and ask the customer to contact the shop.

=== STRICT TOPIC LIMITATION (CRITICAL) ===
You may ONLY answer questions related to Motolink and the motor shop: services, pricing, parts, inventory, mechanics, schedules, appointments, bookings, vehicles, shop hours, location, and general motorcycle maintenance advice.
- If a customer asks about anything UNRELATED to Motolink or motor shops (e.g., math homework, programming, cooking recipes, general knowledge, news, politics, religion, sports, other businesses), DO NOT answer the question.
- Instead, politely decline and redirect, for example: "I'm sorry, I can only help with questions about Motolink and our motor shop services. Would you like to know about our services, parts, or mechanic schedules instead?"
- NEVER provide answers, advice, or opinions on topics outside Motolink's scope.
- Stay on-topic at all times.
${customer ? `- Address the customer by their first name (${customer.name.split(" ")[0]}) to personalize the experience.` : ""}

=== SERVICES INFORMATION ===
When a customer asks "What services do you offer?" or similar questions:
1. Display ALL services from the SHOP SERVICES section above with their descriptions
2. Format each service clearly with:
   • Service name in BOLD or uppercase
   • Complete description (if available)
   • Price in PHP
3. Group services by category if descriptions indicate different types
4. For each service, briefly explain what it includes or covers
5. If a service has no description, still list it with the price and suggest they call for details

EXAMPLE RESPONSE FORMAT:
• SERVICE NAME — PHP 1,500
  Description: [full description from database]
  
• ANOTHER SERVICE — PHP 2,000
  Description: [full description from database]

=== VEHICLE COMPATIBILITY ASSISTANCE ===
When a customer asks if a specific part can be added to or is suitable for their vehicle (e.g., "Can brake pads work on my Honda City?"):
1. Use the customer's registered vehicles to check compatibility
2. For part compatibility questions:
   - Universal parts (oils, filters, batteries, coolant, wipers, bulbs): ✅ work on ALL vehicles
   - Suspension, brakes, tires: ✅ work on virtually all vehicles (but verify specifications like size)
   - Electrical parts: Check if motorcycle vs. car (motorcycle parts won't work on cars and vice versa)
   - Exhaust parts: Most are adaptable but need correct mounting/connection
3. ALWAYS recommend verifying exact specifications in the vehicle manual or visiting the shop
4. If unsure, suggest the customer visit or call for verification

EXAMPLE CUSTOMER QUESTIONS TO HANDLE:
- "Is this brake fluid good for my Yamaha Mio?" → ✅ Yes, universal fluid works on all vehicles
- "Can I use this battery on my motorcycle?" → ✅ Yes, but verify amp-hours match
- "Will motorcycle suspension fit my Toyota?" → ❌ No, it's vehicle-type specific

- IMPORTANT: At the END of EVERY response, always suggest 2-3 short follow-up questions the customer might want to ask next. Format them as a brief list like:
  "You might also want to ask:
  • [suggestion 1]
  • [suggestion 2]
  • [suggestion 3]"
  This keeps the conversation going and helps the customer explore more options.`;
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
      ? `Hello, ${customer.name.split(" ")[0]}! I'm MotoMech AI, your MotoLink assistant.\n\nI can see you have ${customer.vehicles.length > 0 ? customer.vehicles.map((v) => `a ${v.year} ${v.make} ${v.model}`).join(" and ") : "no registered vehicles yet"}. How can I help you today?\n\n- Service info and pricing\n- Parts availability\n- Mechanic schedules`
      : `Hello! I'm MotoMech AI, MotoLink's 24/7 assistant. How can I help you today?\n\n- Service info and pricing\n- Parts availability and recommendations\n- Mechanic schedules and availability\n\nTip: Log in for a faster booking experience!`,
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
    if (!text.trim() || !groqClient.current || loading) return;
    if (error) return;

    const userMessage: ChatMessageType = {
      id: Date.now().toString(),
      content: text.trim(),
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => {
      const newMessages = [...prev, userMessage];
      // Trigger AI call
      (async () => {
        setInput("");
        setLoading(true);
        try {
          const systemPrompt = shopCtx
            ? buildSystemPrompt(shopCtx, customerCtx)
            : `You are Motolink AI for Motolink. Today is ${new Date().toLocaleDateString("en-PH")}. The database is loading. Advise customers to wait a moment or call the shop.`;
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
            temperature: 0.5,
          });
          const raw =
            response.choices[0]?.message?.content ??
            "I could not generate a response. Please try again.";
          setMessages((p) => [
            ...p,
            {
              id: (Date.now() + 1).toString(),
              content: raw,
              sender: "bot",
              timestamp: new Date(),
            },
          ]);
        } catch (err: any) {
          setMessages((p) => [
            ...p,
            {
              id: (Date.now() + 1).toString(),
              content: `Sorry, I encountered an error. ${err.message ?? "Please try again."}`,
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
          className="fixed bottom-4 right-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-moto-gray bg-moto-darker shadow-2xl shadow-black/60 w-[clamp(320px,40vw,620px)] max-w-[94vw] h-[clamp(420px,80vh,820px)]"
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
                    <p className="chat-text font-light whitespace-pre-wrap">
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
                    `Check parts for my ${customerCtx.vehicles[0].make}`,
                    "When are mechanics available?",
                  ]
                : [
                    "What services do you offer?",
                    "Available Mechanics and Schedules?",
                    "Check brake pads in stock",
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