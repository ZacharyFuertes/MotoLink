import React, { useState, useEffect } from "react";
import { X, Mail, Plus, User, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "../services/supabaseClient";

// Inline replacements for deleted staffService
const getMechanics = async () => {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("role", "mechanic")
    .order("name");
  if (error) throw error;
  return data || [];
};

const createMechanicAccount = async (name: string, email: string, password: string) => {
  // Sign up the mechanic via Supabase auth
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  if (authError) throw authError;
  if (!authData.user) throw new Error("Failed to create auth user");

  // Insert into users table
  const { error: insertError } = await supabase.from("users").insert({
    id: authData.user.id,
    email,
    name,
    role: "mechanic",
  });
  if (insertError) throw insertError;
  return authData.user;
};
import { useAuth } from "../contexts/AuthContext";

interface AddMechanicModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AddMechanicModal: React.FC<AddMechanicModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [mechanics, setMechanics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: "", type: "" });

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  useEffect(() => {
    if (isOpen) {
      loadMechanics();
    } else {
      setFormData({ name: "", email: "", password: "" });
      setStatusMsg({ text: "", type: "" });
    }
  }, [isOpen]);

  const loadMechanics = async () => {
    setLoading(true);
    try {
      const data = await getMechanics();
      setMechanics(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.password || !formData.name || !user?.id) return;

    setStatusMsg({ text: "", type: "" });
    setLoading(true);
    
    try {
      await createMechanicAccount(formData.name, formData.email, formData.password);
      setStatusMsg({ text: "Mechanic account created successfully!", type: "success" });
      setFormData({ name: "", email: "", password: "" });
      loadMechanics();
    } catch (err: any) {
      let errorMessage = err.message || "Failed to create mechanic";
      if (errorMessage.includes("User already registered")) {
        errorMessage = "This email is already registered.";
      }
      setStatusMsg({ text: errorMessage, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0a0a0a] border border-[#222] border-t-2 border-t-[#d63a2f] rounded-none w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-start p-6 sm:px-10 py-6 border-b border-[#222] bg-[#111111]">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-[#d63a2f] flex items-center justify-center shrink-0">
              <User size={28} className="text-white" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3 text-[#d63a2f] text-[10px] font-bold tracking-[0.2em] uppercase">
                <div className="w-6 h-[1px] bg-[#d63a2f]" /> MECHANICS
              </div>
              <h2 className="font-display text-3xl sm:text-4xl text-white uppercase leading-none tracking-wide">
                MANAGE MECHANICS
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="p-2 border border-[#333] hover:bg-[#222] transition text-[#6b6b6b] hover:text-white shrink-0">
            <X size={20} strokeWidth={1} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 sm:px-10 py-8 overflow-y-auto scrollbar-hide flex-1 space-y-8 bg-[#0a0a0a]">
          {/* Status Message */}
          {statusMsg.text && (
            <div
              className={`p-4 rounded-none border flex items-center gap-3 text-xs tracking-widest uppercase font-bold ${
                statusMsg.type === "error"
                  ? "bg-[#221515] border-red-500/50 text-red-500"
                  : "bg-green-900/10 border-green-500/50 text-green-500"
              }`}
            >
              {statusMsg.type === "error" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* Create Form */}
          <form onSubmit={handleCreate} className="bg-[#111111] p-6 border border-[#222]">
            <h3 className="text-[10px] font-bold text-[#6b6b6b] uppercase tracking-[0.2em] mb-6">
              ADD NEW MECHANIC
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-4">
              {/* Name */}
              <div className="space-y-2">
                <label className="block text-[10px] font-medium text-[#6b6b6b] tracking-[0.2em] uppercase">Full Name</label>
                <div className="relative">
                  <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#555]" />
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="JOHN DOE"
                    required
                    className="w-full pl-11 pr-4 py-4 bg-[#0a0a0a] border border-[#333] rounded-none text-white focus:outline-none focus:border-[#d63a2f] transition text-xs font-bold tracking-widest uppercase"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label className="block text-[10px] font-medium text-[#6b6b6b] tracking-[0.2em] uppercase">Email Address</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#555]" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="MECHANIC@MOTOSHOP.COM"
                    required
                    className="w-full pl-11 pr-4 py-4 bg-[#0a0a0a] border border-[#333] rounded-none text-white focus:outline-none focus:border-[#d63a2f] transition text-xs font-bold tracking-widest uppercase"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="sm:col-span-2 space-y-2">
                <label className="block text-[10px] font-medium text-[#6b6b6b] tracking-[0.2em] uppercase">Temporary Password</label>
                <div className="flex gap-4">
                  <div className="relative flex-1">
                    <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#555]" />
                    <input
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="w-full pl-11 pr-4 py-4 bg-[#0a0a0a] border border-[#333] rounded-none text-white focus:outline-none focus:border-[#d63a2f] transition text-xs font-bold tracking-widest uppercase"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !formData.email || !formData.password || !formData.name}
                    className="px-8 py-4 bg-[#d63a2f] hover:bg-[#c0322a] disabled:opacity-50 text-white font-bold tracking-widest text-[10px] uppercase transition flex items-center justify-center gap-2 border border-[#d63a2f]"
                  >
                    <Plus size={14} /> CREATE
                  </button>
                </div>
                <p className="text-[10px] tracking-widest uppercase text-[#555] mt-2">Minimum 6 characters. Provide this password to the mechanic.</p>
              </div>
            </div>
          </form>

          {/* Mechanics List */}
          <div>
            <h3 className="text-[10px] font-bold text-[#6b6b6b] uppercase tracking-[0.2em] mb-6">
              ACTIVE MECHANICS
            </h3>
            <div className="space-y-4">
              {loading && mechanics.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-3 border-[#d63a2f] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : mechanics.length === 0 ? (
                <div className="text-center py-8 bg-[#111] border border-[#222] text-[#555] text-xs uppercase tracking-widest font-bold">
                  NO MECHANICS FOUND
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {mechanics.map((mech) => (
                    <div key={mech.id} className="flex items-center justify-between p-5 bg-[#111] border border-[#222] gap-4 transition hover:border-[#333]">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-12 h-12 shrink-0 bg-[#0a0a0a] border border-[#333] flex items-center justify-center">
                          <span className="font-display text-xl text-[#6b6b6b]">{mech.name.substring(0, 1).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-display text-xl sm:text-2xl text-white tracking-wide uppercase leading-none mb-1 truncate">{mech.name}</p>
                          <p className="text-[#6b6b6b] text-xs sm:text-sm font-light truncate">{mech.email}</p>
                        </div>
                      </div>
                      <span className="px-3 py-1.5 bg-[#221515] border border-[#d63a2f] text-[#d63a2f] text-[10px] font-bold uppercase tracking-widest shrink-0">
                        MECHANIC
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddMechanicModal;
