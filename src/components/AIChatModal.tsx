import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  MessageSquare,
  Send,
  Bot,
  User,
  Loader2,
  AlertCircle,
  RefreshCw,
  LogIn,
  Wrench,
} from "lucide-react";
import { Groq } from "groq-sdk";
import { supabase } from "../services/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { checkPartCompatibility } from "../utils/vehicleCompatibility";

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
  id: string; // customers.id
  userId: string; // users.id
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

async function fetchShopContext(): Promise<ShopContext> {
  const [servicesRes, partsRes, mechanicsRes, availRes] =
    await Promise.allSettled([
      supabase
        .from("products")
        .select("name, description, unit_price, category")
        .order("unit_price"),
      supabase
        .from("parts")
        .select("name, category, quantity_in_stock, unit_price")
        .gt("quantity_in_stock", 0)
        .order("category"),
      supabase.from("users").select("id, name, phone").eq("role", "mechanic"),
      supabase
        .from("mechanic_availability")
        .select("mechanic_id, day_of_week, start_time, end_time, is_available")
        .eq("is_available", true),
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
    // Get user info
    const { data: userData } = await supabase
      .from("users")
      .select("id, name, email, phone")
      .eq("id", userId)
      .single();
    if (!userData) return null;

    // Get customer record
    const { data: customerData } = await supabase
      .from("customers")
      .select("id, phone, address")
      .eq("user_id", userId)
      .maybeSingle();
    if (!customerData) return null;

    // Get vehicles
    const { data: vehicles } = await supabase
      .from("vehicles")
      .select("id, make, model, year")
      .eq("customer_id", customerData.id);

    // Get recent appointments
    const { data: appointments } = await supabase
      .from("appointments")
      .select("service_type, status, scheduled_date")
      .eq("customer_id", customerData.id)
      .order("scheduled_date", { ascending: false })
      .limit(5);

    return {
      id: customerData.id,
      userId: userData.id,
      name: userData.name,
      email: userData.email ?? "",
      phone: customerData.phone ?? userData.phone ?? null,
      address: customerData.address ?? null,
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

  return `You are MotoMech AI, the 24/7 virtual assistant for JSBM MotoShop.
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
      ? `Hello, ${customer.name.split(" ")[0]}! I'm MotoMech AI, your JSBM MotoShop assistant.\n\nI can see you have ${customer.vehicles.length > 0 ? customer.vehicles.map((v) => `a ${v.year} ${v.make} ${v.model}`).join(" and ") : "no registered vehicles yet"}. How can I help you today?\n\n- Service info and pricing\n- Parts availability\n- Mechanic schedules`
      : `Hello! I'm MotoMech AI, JSBM MotoShop's 24/7 assistant. How can I help you today?\n\n- Service info and pricing\n- Parts availability and recommendations\n- Mechanic schedules and availability\n\nTip: Log in for a faster booking experience!`,
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
        fetchShopContext(),
        isAuthenticated && user?.id && user.role === "customer"
          ? fetchCustomerContext(user.id)
          : Promise.resolve(null),
      ]);

      setShopCtx(shop);
      setCustomerCtx(customer);

      // Set personalized greeting
      setMessages([buildGreeting(customer)]);
    } catch {
      setMessages([buildGreeting(null)]);
    } finally {
      setCtxLoading(false);
    }
  }, [isAuthenticated, user?.id, user?.role]);

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
            : `You are MotoMech AI for JSBM MotoShop. Today is ${new Date().toLocaleDateString("en-PH")}. The database is loading. Advise customers to wait a moment or call the shop.`;
          const history = newMessages
            .filter((m) => m.id !== "initial")
            .map((m) => ({
              role: (m.sender === "user" ? "user" : "assistant") as
                | "user"
                | "assistant",
              content: m.content,
            }));
          const response = await groqClient.current!.chat.completions.create({
            model: "llama-3.3-70b-versatile",
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

  if (!isOpen) return null;

  const isLoggedInCustomer = isAuthenticated && user?.role === "customer";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 30 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-[#0a0a0a] rounded-none border border-[#222] border-t-2 border-t-[#d63a2f] w-full sm:max-w-[1000px] h-[95vh] sm:h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        >
          {/* ── Header ── */}
          <div className="flex items-start justify-between px-8 sm:px-12 py-8 border-b border-[#222] flex-shrink-0 bg-[#111111]">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-[#d63a2f] flex items-center justify-center shrink-0">
                <MessageSquare
                  size={32}
                  className="text-white"
                  strokeWidth={1.5}
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3 text-[#d63a2f] text-[11px] font-bold tracking-[0.2em] uppercase">
                  <div className="w-6 h-[1px] bg-[#d63a2f]" /> AI ASSISTANT
                </div>
                <h2 className="font-display text-4xl sm:text-5xl text-white uppercase leading-none tracking-wide">
                  MOTOMECH AI
                </h2>
                <div className="flex items-center gap-3 mt-1">
                  {ctxLoading ? (
                    <>
                      <Loader2
                        size={12}
                        className="text-yellow-400 animate-spin"
                      />
                      <span className="text-yellow-400 text-[11px] font-bold tracking-widest"></span>
                    </>
                  ) : shopCtx ? (
                    <> </>
                  ) : (
                    <>
                      <AlertCircle size={12} className="text-yellow-400" />
                      <span className="text-yellow-400 text-[11px] font-bold tracking-widest">
                        OFFLINE MODE
                      </span>
                    </>
                  )}
                  {/* Login status */}
                  <span className="text-[#333] text-[11px]">·</span>
                  {isLoggedInCustomer && customerCtx ? (
                    <>
                      <User size={12} className="text-[#d63a2f]" />
                      <span className="text-[#d63a2f] text-[11px] font-bold tracking-widest">
                        LOGGED IN
                      </span>
                    </>
                  ) : (
                    <>
                      <LogIn size={12} className="text-[#6b6b6b]" />
                      <span className="text-[#6b6b6b] text-[11px] tracking-widest">
                        GUEST
                      </span>
                    </>
                  )}
                  {shopCtx && !ctxLoading && (
                    <button
                      onClick={loadContext}
                      title="Refresh"
                      className="ml-2 text-[#555] hover:text-white transition"
                    >
                      <RefreshCw size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-3 border border-[#333] hover:bg-[#222] transition text-[#6b6b6b] hover:text-white shrink-0"
            >
              <X size={24} strokeWidth={1} />
            </button>
          </div>

          {/* ── Error Banner ── */}
          {error && (
            <div className="bg-[#221515] border-b border-[#d63a2f]/30 px-8 py-4 flex items-center gap-3 text-[#d63a2f] text-sm font-bold tracking-widest uppercase">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* ── Messages ── */}
          <div className="flex-1 overflow-y-auto px-8 sm:px-12 py-10 bg-[#0a0a0a] space-y-8">
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
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col ${message.sender === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`flex gap-5 max-w-[90%] ${message.sender === "user" ? "flex-row-reverse" : "flex-row"}`}
                  >
                    <div
                      className={`w-12 h-12 shrink-0 flex items-center justify-center border ${
                        message.sender === "user"
                          ? "bg-[#111] border-[#333] text-[#6b6b6b]"
                          : "bg-[#221515] border-[#d63a2f] text-[#d63a2f]"
                      }`}
                    >
                      {message.sender === "user" ? (
                        isLoggedInCustomer && customerCtx ? (
                          <span className="text-base font-black text-[#d63a2f]">
                            {customerCtx.name.charAt(0)}
                          </span>
                        ) : (
                          <User size={20} />
                        )
                      ) : (
                        <Bot size={20} />
                      )}
                    </div>
                    <div
                      className={`p-6 border ${
                        message.sender === "user"
                          ? "bg-[#111] border-[#333] text-white"
                          : "bg-[#0a0a0a] border-[#222] text-[#ccc]"
                      }`}
                    >
                      <div className="text-sm sm:text-base font-light leading-relaxed whitespace-pre-wrap">
                        {message.content}
                      </div>
                      <div
                        className={`text-[11px] mt-3 opacity-40 ${message.sender === "user" ? "text-right" : "text-left"}`}
                      >
                        {message.timestamp.toLocaleTimeString("en-PH", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                  {/* Inline follow-up suggestion buttons */}
                  {inlineSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-3 mt-4 ml-16">
                      {inlineSuggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => sendMessageFromText(s)}
                          disabled={loading}
                          className="px-4 py-2 text-[11px] font-bold tracking-wider uppercase border border-[#333] text-[#6b6b6b] hover:border-[#d63a2f] hover:text-[#d63a2f] hover:bg-[#1a1010] transition-colors disabled:opacity-30"
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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="flex gap-5">
                  <div className="w-12 h-12 shrink-0 flex items-center justify-center border bg-[#221515] border-[#d63a2f] text-[#d63a2f]">
                    <Bot size={20} />
                  </div>
                  <div className="p-6 border bg-[#0a0a0a] border-[#222] flex items-center gap-3">
                    <Loader2
                      size={18}
                      className="animate-spin text-[#d63a2f]"
                    />
                    <span className="text-[11px] uppercase tracking-widest font-bold text-[#6b6b6b]">
                      THINKING...
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Input ── */}
          <div className="p-8 sm:px-12 border-t border-[#222] bg-[#111111]">
            {/* Quick chips — personalized if logged in */}
            <div className="flex flex-wrap gap-3 mb-6">
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
                    "Available parts for my motorcycle?",
                  ]
              ).map((chip) => (
                <button
                  key={chip}
                  onClick={() => sendMessageFromText(chip)}
                  disabled={loading}
                  className="px-4 py-2 text-[11px] font-bold tracking-wider uppercase border border-[#333] text-[#6b6b6b] hover:border-[#d63a2f] hover:text-[#d63a2f] transition-colors disabled:opacity-30 truncate max-w-[200px]"
                >
                  {chip}
                </button>
              ))}
            </div>
            <div className="flex gap-5">
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
                className="flex-1 bg-[#0a0a0a] text-white px-6 py-5 border border-[#333] focus:border-[#d63a2f] focus:outline-none transition text-sm font-bold tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleSendMessage}
                disabled={loading || !input.trim() || !!error}
                className="w-16 shrink-0 bg-[#d63a2f] hover:bg-[#c0322a] disabled:bg-[#333] disabled:text-[#6b6b6b] text-white flex items-center justify-center transition-colors disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 size={24} className="animate-spin" />
                ) : (
                  <Send size={24} />
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AIChatModal;
