/**
 * AdminChatbot.tsx
 * TODO: implemented — Powerful context-aware Admin AI Assistant (Groq-powered)
 *
 * This chatbot fetches full business data (revenue, inventory, appointments,
 * reservations) and injects it into the system prompt so
 * the AI can answer analytical business questions naturally.
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Send,
  Bot,
  Sparkles,
  BarChart3,
  Package,
  Calendar,
  TrendingUp,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Groq } from "groq-sdk";
import { supabase } from "../services/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import {
  buildAdminSystemPrompt,
  STATIC_REFUSAL_MESSAGE,
} from "../prompts/adminChatbotPrompt";
import { checkIsOffTopic } from "../utils/aiGuardrails";

/* ------------------------------------------------------------------ */
/*  TYPES                                                              */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AdminChatbotProps {
  isOpen: boolean;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  QUICK PROMPT CHIPS                                                 */
/* ------------------------------------------------------------------ */

const QUICK_PROMPTS = [
  {
    label: "Revenue Summary",
    icon: TrendingUp,
    prompt:
      "Give me a revenue summary — total earnings, recent trends, and top-selling parts.",
  },
  {
    label: "Low Stock Alert",
    icon: Package,
    prompt:
      "Which parts are low in stock or out of stock? List them with current quantities.",
  },
  {
    label: "Today's Appointments",
    icon: Calendar,
    prompt:
      "How many appointments are scheduled for today? List them with details.",
  },
  {
    label: "Business Insights",
    icon: BarChart3,
    prompt:
      "Provide a quick business health overview — appointments, revenue, inventory status, and any concerns.",
  },
];

/* ------------------------------------------------------------------ */
/*  COMPONENT                                                          */
/* ------------------------------------------------------------------ */

const AdminChatbot: React.FC<AdminChatbotProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  // This chatbot serves SHOP OWNERS ONLY — always scoped to their own shop.
  const role: "admin" | "owner" = "owner";
  const isAdmin = false;
  const shopId = user?.shop_id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [shopData, setShopData] = useState<string>("");
  const [shopName, setShopName] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const groqClient = useRef<Groq | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize Groq client
  useEffect(() => {
    // @ts-ignore - Vite env
    const apiKey = import.meta.env.VITE_GROQ_API_KEY as string;
    if (
      apiKey &&
      typeof apiKey === "string" &&
      apiKey !== "your_groq_api_key_here"
    ) {
      groqClient.current = new Groq({ apiKey, dangerouslyAllowBrowser: true });
    }
  }, []);

  // Fetch all business data for context (scoped by role)
  const fetchShopData = useCallback(async () => {
    setDataLoading(true);
    try {
      // Owners only ever see their OWN shop's rows (platform admins see all)
      const applyShopScope = (query: any) => {
        if (isAdmin) return query;
        if (!shopId) return query.eq("shop_id", "__none__");
        return query.eq("shop_id", shopId);
      };

      let shopNameData: string | null = null;
      if (!isAdmin && shopId) {
        const { data: shopRes } = await supabase
          .from("shops")
          .select("name")
          .eq("id", shopId)
          .single();
        shopNameData = shopRes?.name ?? null;
        setShopName(shopNameData);
      }

      // Fetch reservations separately with error handling
      let reservationsData: any[] = [];
      try {
        const reservationsRes = await applyShopScope(
          supabase
            .from("reservations")
            .select("*, part:parts(name, unit_price)"),
        );
        reservationsData = reservationsRes.data || [];
      } catch {
        // reservations table may not exist yet
        reservationsData = [];
      }
      // Fetch part_sales separately with error handling
      let partSalesData: any[] = [];
      try {
        const partSalesRes = await applyShopScope(
          supabase.from("part_sales").select("*"),
        );
        partSalesData = partSalesRes.data || [];
      } catch {
        partSalesData = [];
      }

      const [partsRes, appointmentsRes, usersRes, jobOrdersRes, productsRes] =
        await Promise.all([
          applyShopScope(supabase.from("parts").select("*")),
          applyShopScope(supabase.from("appointments").select("*")),
          applyShopScope(
            supabase.from("users").select("id, name, role, email, shop_id, created_at"),
          ),
          applyShopScope(supabase.from("job_orders").select("*")),
          applyShopScope(supabase.from("products").select("*")),
        ]);

      const parts = partsRes.data || [];
      const appointments = appointmentsRes.data || [];
      const users = usersRes.data || [];
      const jobOrders = jobOrdersRes.data || [];
      const products = productsRes.data || [];
      const reservations = reservationsData;
      const partSales = partSalesData;

      // Compute metrics
      const mechanics = users.filter((u: any) => u.role === "mechanic");
      const customers = users.filter((u: any) => u.role === "customer");
      const totalInventoryValue = parts.reduce(
        (sum: number, p: any) =>
          sum + p.unit_price * (p.quantity_in_stock || 0),
        0,
      );
      const lowStockParts = parts.filter(
        (p: any) => (p.quantity_in_stock || 0) <= (p.min_stock_level || 5),
      );
      const outOfStockParts = parts.filter(
        (p: any) => (p.quantity_in_stock || 0) === 0,
      );

      // Appointment stats
      const today = new Date().toISOString().split("T")[0];
      const todayAppointments = appointments.filter(
        (a: any) => a.scheduled_date === today,
      );
      const pendingAppointments = appointments.filter(
        (a: any) => a.status === "pending",
      );
      const completedAppointments = appointments.filter(
        (a: any) => a.status === "completed",
      );
      const inProgressAppointments = appointments.filter(
        (a: any) => a.status === "in_progress",
      );

      // Revenue calculation matching the Dashboard
      const revenueAppointments = appointments
        .filter((a: any) =>
          ["confirmed", "in_progress", "completed"].includes(a.status),
        )
        .reduce(
          (sum: number, a: any) => sum + (Number(a.estimated_price) || 0),
          0,
        );

      const revenueReservations = reservations
        .filter((r: any) => ["confirmed", "fulfilled"].includes(r.status))
        .reduce((sum: number, r: any) => {
          const unitPrice =
            (r.parts as any)?.unit_price || (r.part as any)?.unit_price || 0;
          return sum + Number(unitPrice) * (r.quantity || 1);
        }, 0);

      const revenueJobOrders = jobOrders
        .filter((j: any) => j.status === "completed")
        .reduce((sum: number, j: any) => sum + (Number(j.total_cost) || 0), 0);

      const revenuePOS = partSales.reduce(
        (sum: number, s: any) => sum + (Number(s.sale_price) || 0),
        0,
      );

      const totalRevenue =
        revenueAppointments +
        revenueReservations +
        revenueJobOrders +
        revenuePOS;

      // Most popular parts (by job order usage)
      const partUsage: Record<string, number> = {};
      jobOrders.forEach((jo: any) => {
        if (jo.parts_used && Array.isArray(jo.parts_used)) {
          jo.parts_used.forEach((pu: any) => {
            const name = pu.name || pu.part_name || "Unknown";
            partUsage[name] = (partUsage[name] || 0) + (pu.quantity || 1);
          });
        }
      });
      const popularParts = Object.entries(partUsage)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => `${name} (used ${count} times)`);

      // Reservation stats
      const pendingReservations = reservations.filter(
        (r: any) => r.status === "pending",
      );

      // Build context string
      const context = `
=== ${isAdmin ? "MOTOLINK BUSINESS DATA (LIVE)" : "YOUR SHOP DATA (LIVE)"} ===
${isAdmin ? "" : `Shop: ${shopNameData ?? "your shop"}\n`}Date: ${new Date().toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

OVERVIEW:
- Total Mechanics: ${mechanics.length}
- Total Customers: ${customers.length}
- Total Parts in Inventory: ${parts.length}
- Total Inventory Value: ₱${totalInventoryValue.toLocaleString()}

REVENUE:
- Total Overall Revenue: ₱${totalRevenue.toLocaleString()}
- Total Completed Job Orders: ${completedAppointments.length}

APPOINTMENTS:
- Today's Appointments: ${todayAppointments.length}
- Pending: ${pendingAppointments.length}
- In Progress: ${inProgressAppointments.length}
- Total Completed: ${completedAppointments.length}
- Total All-Time: ${appointments.length}

INVENTORY:
- Low Stock Items (≤ min level): ${lowStockParts.length}
${lowStockParts.map((p: any) => `  • ${p.name} — ${p.quantity_in_stock} left (min: ${p.min_stock_level || 5}), SKU: ${p.sku}`).join("\n")}
- Out of Stock: ${outOfStockParts.length}
${outOfStockParts.map((p: any) => `  • ${p.name} (SKU: ${p.sku})`).join("\n")}

RESERVATIONS:
- Pending Reservations: ${pendingReservations.length}
${pendingReservations.map((r: any) => `  • Part: ${r.part?.name || "Unknown"} — Qty: ${r.quantity} — Price: ₱${r.part?.unit_price?.toLocaleString() || "N/A"}`).join("\n")}

MOST POPULAR PARTS (by usage in job orders):
${popularParts.length > 0 ? popularParts.map((p) => `  • ${p}`).join("\n") : "  No usage data available yet"}

SERVICES OFFERED:
${products.length > 0 ? products.map((prod: any) => `  • ${prod.name} | Category: ${prod.category || "N/A"} | Price: ₱${prod.unit_price} | Description: ${prod.description || "No description"}`).join("\n") : "  No services listed"}

ALL PARTS LIST:
${parts.map((p: any) => `  • ${p.name} | Category: ${p.category || "N/A"} | Price: ₱${p.unit_price} | Stock: ${p.quantity_in_stock || 0} | SKU: ${p.sku}`).join("\n")}
`.trim();

      setShopData(context);
    } catch (err) {
      console.error("Error fetching shop data for AI:", err);
      setShopData("Unable to fetch shop data. Please try again.");
    } finally {
      setDataLoading(false);
    }
  }, [isAdmin, shopId]);

  useEffect(() => {
    if (isOpen) {
      fetchShopData();
    }
  }, [isOpen, fetchShopData]);

  // Restore previous conversation when the chat opens
  useEffect(() => {
    if (isOpen) {
      const saved = sessionStorage.getItem(
        `motolink_ai_chat_${role}_${shopId ?? "all"}`,
      );
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
          }
        } catch {
          // corrupted storage → start fresh
        }
      }
    }
  }, [isOpen, role, shopId]);

  // Persist the conversation so it survives closing / re-opening the chat
  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem(
        `motolink_ai_chat_${role}_${shopId ?? "all"}`,
        JSON.stringify(messages),
      );
    }
  }, [messages, role, shopId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleSend = async (overrideMessage?: string) => {
    const userInput = overrideMessage || input.trim();
    if (!userInput || !groqClient.current) return;

    // 1. Instant Client-Side Guardrail
    if (checkIsOffTopic(userInput)) {
      const refusalMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: STATIC_REFUSAL_MESSAGE,
        timestamp: new Date(),
      };
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "user",
          content: userInput,
          timestamp: new Date(),
        },
        refusalMsg,
      ]);
      setInput("");
      return;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: userInput,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const systemPrompt = buildAdminSystemPrompt(
        shopData,
        role,
        shopName ?? undefined,
      );

      const conversationHistory = messages.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

      let responseContent = "";
      const stream = await groqClient.current.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: userInput },
        ],
        max_tokens: 1500,
        temperature: 0.5,
        stream: true,
      });

      for await (const chunk of stream) {
        if (chunk.choices[0]?.delta?.content) {
          responseContent += chunk.choices[0].delta.content;
        }
      }

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          responseContent ||
          "I wasn't able to generate a response. Please try again.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Something went wrong, please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  // Helper: parse follow-up suggestion questions from bot response
  const parseSuggestions = (content: string): string[] => {
    const lines = content.split("\n");
    const suggestions: string[] = [];
    let inSuggestionSection = false;
    for (const line of lines) {
      const trimmed = line.trim();
      // Detect the "You might also want to ask:" section
      if (
        trimmed.toLowerCase().includes("you might also want to ask") ||
        trimmed.toLowerCase().includes("you may also want to ask") ||
        trimmed.toLowerCase().includes("you could also ask")
      ) {
        inSuggestionSection = true;
        continue;
      }
      if (inSuggestionSection) {
        const match = trimmed.match(/^(?:[•\-\*]|\d+[\.\)])\s*(.+)/);
        if (match && match[1]) {
          const text = match[1]
            .replace(/^["']|["']$/g, "")
            .replace(/\*+/g, "")
            .trim();
          if (text.length > 5 && text.endsWith("?")) {
            suggestions.push(text);
          }
        }
      }
    }
    // Fallback: if no section found, try to grab any question-ending bullet from the last lines
    if (suggestions.length === 0) {
      const lastLines = lines.slice(-6);
      for (const line of lastLines) {
        const trimmed = line.trim();
        const match = trimmed.match(/^(?:[•\-\*]|\d+[\.\)])\s*(.+)/);
        if (match && match[1]) {
          const text = match[1]
            .replace(/^["']|["']$/g, "")
            .replace(/\*+/g, "")
            .trim();
          if (text.length > 5 && text.endsWith("?")) {
            suggestions.push(text);
          }
        }
      }
    }
    return suggestions.slice(0, 3);
  };

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
                  <Bot
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
                  <p className="text-slate-100 font-bold text-sm tracking-wide truncate">
                    {isAdmin ? "Admin AI" : "Shop AI"}
                  </p>
                  <Sparkles size={12} className="text-moto-accent shrink-0" />
                  {dataLoading ? (
                    <Loader2 size={11} className="text-moto-accent animate-spin shrink-0" />
                  ) : (
                    <span className="text-[9px] text-green-400 font-bold tracking-widest uppercase shrink-0">
                      ● Active
                    </span>
                  )}
                </div>
                <p className="text-[9px] text-slate-500 font-bold tracking-[0.16em] uppercase truncate">
                  {isAdmin
                    ? "Platform Business Intelligence"
                    : shopName
                      ? `${shopName} Business Intelligence`
                      : "Shop Business Intelligence"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                title="Refresh data"
                onClick={fetchShopData}
                className="p-1.5 rounded-full text-slate-500 hover:text-moto-accent hover:bg-moto-gray/40 transition cursor-pointer"
              >
                <RefreshCw size={13} />
              </span>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-moto-gray/40 transition"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* ── Groq key warning ── */}
          {!groqClient.current && (
            <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-2.5 flex items-center gap-2 text-red-400 text-[10px] font-bold tracking-widest uppercase flex-shrink-0">
              <AlertCircle size={12} />
              <span className="truncate">GROQ API KEY NOT CONFIGURED</span>
            </div>
          )}

          {/* ── Messages ── */}
          <div className="chat-scroll flex-1 px-3.5 py-4 bg-moto-darker space-y-4">
            {/* Welcome message */}
            {messages.length === 0 && (
              <div className="space-y-3">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-moto-dark border border-moto-gray px-3.5 py-2.5 rounded-2xl rounded-bl-md text-slate-200 max-w-[88%]">
                    <p className="chat-text font-light">
                      {isAdmin
                        ? "Ask me anything about the MotoLink platform or any shop — revenue, inventory, appointments, and more."
                        : "Ask me anything about your shop — revenue, inventory, appointments, and more."}
                    </p>
                  </div>
                </motion.div>
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {QUICK_PROMPTS.map((qp, idx) => {
                    const Icon = qp.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSend(qp.prompt)}
                        disabled={loading || dataLoading || !groqClient.current}
                        className="flex items-center gap-2 px-3 py-2.5 bg-moto-dark border border-moto-gray hover:border-moto-accent hover:bg-moto-gray/30 transition text-left group disabled:opacity-40 rounded-xl"
                      >
                        <Icon size={13} className="text-moto-accent shrink-0" />
                        <span className="chat-chip text-slate-400 font-bold tracking-wider uppercase group-hover:text-moto-accent transition truncate">
                          {qp.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Chat messages */}
            {messages.map((msg, idx) => {
              const isLastAssistant =
                msg.role === "assistant" && idx === messages.length - 1;
              const inlineSuggestions =
                isLastAssistant && !loading
                  ? parseSuggestions(msg.content)
                  : [];
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl ${
                      msg.role === "user"
                        ? "bg-moto-accent text-slate-950 rounded-br-md"
                        : "bg-moto-dark border border-moto-gray text-slate-200 rounded-bl-md"
                    }`}
                  >
                    <p
                      className={`chat-text whitespace-pre-wrap ${
                        msg.role === "user" ? "font-semibold" : "font-medium"
                      }`}
                    >
                      {msg.role === "assistant"
                        ? msg.content
                            .split(
                              /(?:You might also want to ask:|You may also want to ask:|You could also ask:)/i,
                            )[0]
                            .trim()
                        : msg.content}
                    </p>
                    <p
                      className={`chat-text-xs mt-1.5 ${msg.role === "user" ? "text-slate-900/60" : "text-slate-500"}`}
                    >
                      {msg.timestamp.toLocaleTimeString("en-PH", {
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
                          onClick={() => handleSend(s)}
                          disabled={loading}
                          className="chat-chip px-3 py-1.5 font-bold tracking-wider uppercase rounded-full border border-moto-accent/40 text-moto-accent hover:bg-moto-accent/20 hover:text-moto-accent transition-colors disabled:opacity-30"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* Loading indicator */}
            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="bg-moto-dark border border-moto-gray px-3.5 py-3 rounded-2xl rounded-bl-md flex items-center gap-2">
                  <div className="flex gap-1">
                    <motion.div
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ duration: 0.6, repeat: Infinity }}
                      className="w-1.5 h-1.5 bg-moto-accent rounded-full"
                    />
                    <motion.div
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        delay: 0.2,
                      }}
                      className="w-1.5 h-1.5 bg-moto-accent rounded-full"
                    />
                    <motion.div
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        delay: 0.4,
                      }}
                      className="w-1.5 h-1.5 bg-moto-accent rounded-full"
                    />
                  </div>
                  <span className="chat-text-xs uppercase tracking-widest font-bold text-slate-500">
                    Analyzing...
                  </span>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input ── */}
          <div className="px-3.5 py-3 bg-moto-dark border-t border-moto-gray flex-shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) handleSend();
                }}
                placeholder={
                  dataLoading
                    ? "Loading shop data..."
                    : "Ask about revenue, inventory, appointments..."
                }
                disabled={loading || dataLoading || !groqClient.current}
                className="flex-1 bg-moto-darker text-slate-100 px-4 py-2.5 rounded-full border border-moto-gray focus:border-moto-accent focus:outline-none transition text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-slate-500"
              />
              <button
                onClick={() => handleSend()}
                disabled={
                  loading || !input.trim() || dataLoading || !groqClient.current
                }
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

export default AdminChatbot;