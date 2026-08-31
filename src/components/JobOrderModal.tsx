import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wrench, Plus, X, Clock3, Package, Trash2 } from "lucide-react";
import { Appointment, JobOrder, JobOrderPart } from "../types";
import { jobOrderService } from "../services/jobOrderService";
import { supabase } from "../services/supabaseClient";

interface JobOrderModalProps {
  isOpen: boolean;
  appointment: Appointment | null;
  onClose: () => void;
}

interface ShopPart {
  id: string;
  name: string;
  unit_price: number;
  quantity_in_stock: number;
}

const JobOrderModal: React.FC<JobOrderModalProps> = ({
  isOpen,
  appointment,
  onClose,
}) => {
  const [jobOrder, setJobOrder] = useState<JobOrder | null>(null);
  const [parts, setParts] = useState<ShopPart[]>([]);
  const [laborHours, setLaborHours] = useState("");
  const [laborRate, setLaborRate] = useState("");
  const [selectedPart, setSelectedPart] = useState("");
  const [selectedQty, setSelectedQty] = useState("1");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!appointment) return;
    setLoading(true);
    setMessage("");
    try {
      const [existing, partsData] = await Promise.all([
        jobOrderService.getJobOrderForAppointment(appointment.id),
        supabase
          .from("parts")
          .select("id, name, unit_price, quantity_in_stock")
          .eq("shop_id", appointment.shop_id)
          .order("name"),
      ]);

      setJobOrder(existing);
      setParts(partsData.data || []);

      if (existing) {
        setLaborHours(existing.labor_hours?.toString() ?? "");
        setLaborRate(existing.labor_rate?.toString() ?? "");
      }
    } catch (e) {
      console.error("Error loading job order:", e);
    } finally {
      setLoading(false);
    }
  }, [appointment]);

  useEffect(() => {
    if (isOpen && appointment) load();
  }, [isOpen, appointment, load]);

  if (!appointment) return null;

  const totalPartsCost = (jobOrder?.parts_used || []).reduce(
    (sum, p) => sum + (p.quantity_used || 0) * (p.unit_price || 0),
    0,
  );
  const totalLaborCost =
    (jobOrder?.labor_hours || 0) * (jobOrder?.labor_rate || 0);
  const totalCost = totalPartsCost + totalLaborCost;

  const handleStartJobOrder = async () => {
    if (!appointment) return;
    setSaving(true);
    setMessage("");
    try {
      const created = await jobOrderService.ensureJobOrderForAppointment(appointment);
      if (created) {
        setJobOrder(created);
        setMessage("Job order created for this appointment.");
      } else {
        setMessage("Failed to create job order.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLabor = async () => {
    if (!jobOrder) return;
    const hours = parseFloat(laborHours);
    const rate = parseFloat(laborRate);
    if (isNaN(hours) || hours < 0 || isNaN(rate) || rate < 0) {
      setMessage("Enter valid labor hours and rate.");
      return;
    }
    setSaving(true);
    const ok = await jobOrderService.logLabor(jobOrder.id, hours, rate);
    setSaving(false);
    setMessage(ok ? "Labor hours saved." : "Failed to save labor.");
    if (ok) load();
  };

  const handleAddPart = async () => {
    if (!jobOrder) return;
    if (!selectedPart) {
      setMessage("Select a part first.");
      return;
    }
    const qty = parseInt(selectedQty, 10);
    if (isNaN(qty) || qty <= 0) {
      setMessage("Enter a valid quantity.");
      return;
    }
    const part = parts.find((p) => p.id === selectedPart);
    if (!part) return;
    if (part.quantity_in_stock < qty) {
      setMessage(`Only ${part.quantity_in_stock} in stock for ${part.name}.`);
      return;
    }

    setSaving(true);
    const ok = await jobOrderService.addPartUsed(jobOrder.id, {
      part_id: part.id,
      quantity_used: qty,
      unit_price: part.unit_price,
    });
    setSaving(false);
    setMessage(ok ? `${part.name} added to job order.` : "Failed to add part.");
    if (ok) load();
  };

  const handleRemovePart = async (partId: string) => {
    if (!jobOrder) return;
    const nextParts: JobOrderPart[] = (jobOrder.parts_used || []).filter(
      (p) => p.part_id !== partId,
    );
    const partsCost = nextParts.reduce(
      (sum, p) => sum + (p.quantity_used || 0) * (p.unit_price || 0),
      0,
    );
    const laborCost = (jobOrder.labor_hours || 0) * (jobOrder.labor_rate || 0);
    const totalCost = Math.round((partsCost + laborCost) * 100) / 100;

    const { error } = await supabase
      .from("job_orders")
      .update({
        parts_used: nextParts,
        total_cost: totalCost,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobOrder.id);

    if (!error) load();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[90]"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-white rounded-2xl border border-slate-200 border-t-2 border-t-slate-900 w-full max-w-2xl shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto"
          >
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-slate-50 z-10">
              <h3 className="text-xl font-display font-bold text-slate-900 uppercase tracking-wide">
                Job Order
              </h3>
              <button
                onClick={onClose}
                className="text-slate-500 hover:text-slate-900 transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-6 space-y-6">
              <div>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">
                  Service
                </p>
                <p className="text-slate-900 font-bold">
                  {appointment.service_type}
                </p>
                <p className="text-slate-500 text-sm mt-1">
                  {new Date(appointment.scheduled_date).toLocaleDateString(
                    "en-PH",
                    {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    },
                  )}{" "}
                  at {appointment.scheduled_time}
                </p>
              </div>

              {loading ? (
                <p className="text-slate-500 text-xs uppercase tracking-widest">
                  Loading...
                </p>
              ) : !jobOrder ? (
                <div className="border border-slate-200 p-6 text-center rounded-xl">
                  <Wrench className="w-10 h-10 text-slate-900 mx-auto mb-3" />
                  <p className="text-slate-900 font-bold uppercase tracking-widest text-sm mb-1">
                    No job order yet
                  </p>
                  <p className="text-slate-500 text-xs mb-5">
                    Create a job order to start logging labor and parts for this
                    appointment.
                  </p>
                  <button
                    onClick={handleStartJobOrder}
                    disabled={saving}
                    className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-widest transition disabled:opacity-50 rounded-xl"
                  >
                    Start Job Order
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
                      Status
                    </p>
                    <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 border border-slate-300 text-slate-600">
                      {jobOrder.status.replace(/_/g, " ")}
                    </span>
                  </div>

                  {/* Labor logging */}
                  <div className="border border-slate-200 p-4 rounded-xl">
                    <p className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-widest mb-3">
                      <Clock3 size={14} className="text-slate-900" /> Labor Log
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                          Hours
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={laborHours}
                          onChange={(e) => setLaborHours(e.target.value)}
                          className="w-full bg-white text-slate-900 px-3 py-2.5 border border-slate-300 focus:border-slate-500 focus:outline-none transition rounded-xl text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                          Rate (PHP/hr)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          value={laborRate}
                          onChange={(e) => setLaborRate(e.target.value)}
                          className="w-full bg-white text-slate-900 px-3 py-2.5 border border-slate-300 focus:border-slate-500 focus:outline-none transition rounded-xl text-xs font-bold"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleSaveLabor}
                      disabled={saving || jobOrder.status === "completed"}
                      className="mt-3 w-full bg-slate-900 hover:bg-slate-800 text-white py-2.5 font-bold text-[10px] uppercase tracking-widest transition disabled:opacity-50 rounded-xl"
                    >
                      Save Labor
                    </button>
                  </div>

                  {/* Parts */}
                  <div className="border border-slate-200 p-4 rounded-xl">
                    <p className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-widest mb-3">
                      <Package size={14} className="text-slate-900" /> Parts Used
                    </p>
                    {(jobOrder.parts_used || []).length === 0 ? (
                      <p className="text-slate-600 text-xs">
                        No parts logged yet.
                      </p>
                    ) : (
                      <div className="space-y-2 mb-4">
                        {(jobOrder.parts_used || []).map((p) => (
                          <div
                            key={p.part_id}
                            className="flex items-center justify-between bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl"
                          >
                            <div>
                              <p className="text-slate-900 text-sm font-bold">
                                {parts.find((x) => x.id === p.part_id)?.name ||
                                  "Part"}
                              </p>
                              <p className="text-slate-500 text-xs">
                                {p.quantity_used} × PHP{" "}
                                {Number(p.unit_price).toLocaleString()}
                              </p>
                            </div>
                            {jobOrder.status !== "completed" && (
                              <button
                                onClick={() => handleRemovePart(p.part_id)}
                                className="text-slate-500 hover:text-red-400 transition"
                                aria-label="Remove part"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {jobOrder.status !== "completed" && (
                      <div className="grid grid-cols-[1fr_80px_auto] gap-2 items-end">
                        <div>
                          <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                            Part
                          </label>
                          <select
                            value={selectedPart}
                            onChange={(e) => setSelectedPart(e.target.value)}
                            className="w-full bg-white text-slate-900 px-3 py-2.5 border border-slate-300 focus:border-slate-500 focus:outline-none transition rounded-xl text-xs font-bold"
                          >
                            <option value="">Select part...</option>
                            {parts.map((part) => (
                              <option key={part.id} value={part.id}>
                                {part.name} {part.quantity_in_stock} in stock
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                            Qty
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={selectedQty}
                            onChange={(e) => setSelectedQty(e.target.value)}
                            className="w-full bg-white text-slate-900 px-3 py-2.5 border border-slate-300 focus:border-slate-500 focus:outline-none transition rounded-xl text-xs font-bold"
                          />
                        </div>
                        <button
                          onClick={handleAddPart}
                          disabled={saving}
                          className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 font-bold text-[10px] uppercase tracking-widest transition disabled:opacity-50 rounded-xl"
                        >
                          <Plus size={14} /> Add
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Total */}
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-4 rounded-xl">
                    <div>
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                        Parts: PHP {totalPartsCost.toLocaleString()}
                      </p>
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">
                        Labor: PHP {totalLaborCost.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                        Total
                      </p>
                      <p className="text-slate-900 font-black text-2xl">
                        ₱{totalCost.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {jobOrder.status !== "completed" && (
                    <p className="text-center text-[10px] text-slate-600 uppercase tracking-widest">
                      The owner finalizes the job order and generates the
                      invoice upon completion.
                    </p>
                  )}
                </>
              )}

              {message && (
                <p className="text-center text-sm text-slate-400">{message}</p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default JobOrderModal;
