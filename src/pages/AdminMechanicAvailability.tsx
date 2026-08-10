import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, Clock, Plus, Trash2, X } from 'lucide-react'

import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../services/supabaseClient'

interface Mechanic {
  id: string
  name: string
  email: string
}

interface Availability {
  id: string
  mechanic_id: string
  mechanic_name: string
  day_of_week: number | string
  start_time: string
  end_time: string
  is_available: boolean
}

interface AdminMechanicAvailabilityProps {
  onNavigate?: (page: string) => void
}

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const AdminMechanicAvailability: React.FC<AdminMechanicAvailabilityProps> = ({ onNavigate }) => {
  const { user } = useAuth()
  const [mechanics, setMechanics] = useState<Mechanic[]>([])
  const [availability, setAvailability] = useState<Availability[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMechanic, setSelectedMechanic] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Mechanic | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmationInput, setConfirmationInput] = useState('')
  const [formData, setFormData] = useState({
    mechanic_id: '',
    day_of_week: 'Monday',
    start_time: '08:00',
    end_time: '17:00',
  })

  useEffect(() => {
    if (user?.role === 'admin') return;
    if (user?.role !== 'owner') {
      onNavigate && onNavigate('dashboard')
    }
  }, [user?.role])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)

      let mechQuery = supabase
        .from('users')
        .select('id, name, email')
        .eq('role', 'mechanic')

      if (user?.shop_id) {
        mechQuery = mechQuery.eq('shop_id', user.shop_id)
      }

      const { data: mechanicsData, error: mechanicsError } = await mechQuery

      if (mechanicsError) throw mechanicsError
      setMechanics(mechanicsData || [])

      let availabilityData: any[] = []
      try {
        const mechanicIds = (mechanicsData || []).map((m: any) => m.id)
        let availQuery = supabase
          .from('mechanic_availability')
          .select('*')
          .order('day_of_week', { ascending: true })
        if (mechanicIds.length > 0) {
          availQuery = availQuery.in('mechanic_id', mechanicIds)
        }
        const { data, error: availabilityError } = await availQuery

        if (availabilityError && availabilityError.code !== 'PGRST116') {
          console.warn('Could not fetch mechanic_availability:', availabilityError.message)
        } else {
          availabilityData = data || []
        }
      } catch (e) {
        console.warn('mechanic_availability table may not exist:', e)
      }

      const enhancedAvailability: Availability[] = availabilityData.map((av: any) => {
        const mechanic = mechanicsData?.find((m) => m.id === av.mechanic_id)
        return {
          ...av,
          mechanic_name: mechanic?.name || 'Unknown',
        }
      })

      setAvailability(enhancedAvailability)
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddAvailability = async () => {
    if (!formData.mechanic_id) {
      alert('Please select a mechanic')
      return
    }

    try {
      const { data, error } = await supabase
        .from('mechanic_availability')
        .insert([
          {
            mechanic_id: formData.mechanic_id,
            day_of_week: daysOfWeek.indexOf(formData.day_of_week),
            start_time: formData.start_time,
            end_time: formData.end_time,
            is_available: true,
            shop_id: user?.shop_id || null,
          },
        ])
        .select()
        .single()

      if (error) throw error

      const mechanic = mechanics.find((m) => m.id === formData.mechanic_id)
      setAvailability([
        ...availability,
        {
          ...data,
          mechanic_name: mechanic?.name || 'Unknown',
        },
      ])

      setFormData({
        mechanic_id: '',
        day_of_week: 'Monday',
        start_time: '08:00',
        end_time: '17:00',
      })
      setShowAddForm(false)
    } catch (err) {
      console.error('Error adding availability:', err)
      alert('Failed to add availability')
    }
  }

  const handleDeleteAvailability = async (availabilityId: string) => {
    if (!confirm('Are you sure you want to delete this availability slot?')) return

    try {
      const { error } = await supabase
        .from('mechanic_availability')
        .delete()
        .eq('id', availabilityId)

      if (error) throw error
      setAvailability(availability.filter((a) => a.id !== availabilityId))
    } catch (err) {
      console.error('Error deleting availability:', err)
      alert('Failed to delete availability')
    }
  }

  const handleDeleteMechanic = async () => {
    if (!deleteConfirm) return

    try {
      setDeleting(true)

      try {
        await supabase
          .from('job_orders')
          .delete()
          .eq('mechanic_id', deleteConfirm.id)
      } catch (e) {}

      try {
        await supabase
          .from('mechanic_availability')
          .delete()
          .eq('mechanic_id', deleteConfirm.id)
      } catch (e) {}

      try {
        await supabase
          .from('appointments')
          .delete()
          .eq('mechanic_id', deleteConfirm.id)
      } catch (e) {}

      const { error: userError } = await supabase
        .from('users')
        .delete()
        .eq('id', deleteConfirm.id)

      if (userError) throw userError

      setMechanics(mechanics.filter((m) => m.id !== deleteConfirm.id))
      setAvailability(availability.filter((a) => a.mechanic_id !== deleteConfirm.id))
      if (selectedMechanic === deleteConfirm.id) setSelectedMechanic(null)
      setDeleteConfirm(null)
      setConfirmationInput('')
    } catch (err) {
      console.error('Error deleting mechanic:', err)
      alert('Error deleting mechanic. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const handleToggleAvailability = async (availabilityId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('mechanic_availability')
        .update({ is_available: !currentStatus })
        .eq('id', availabilityId)

      if (error) throw error
      setAvailability(
        availability.map((a) => (a.id === availabilityId ? { ...a, is_available: !currentStatus } : a))
      )
    } catch (err) {
      console.error('Error updating availability:', err)
      alert('Failed to update availability')
    }
  }

  const selectedMechanicData = mechanics.find((m) => m.id === selectedMechanic)
  const filteredAvailability = selectedMechanic
    ? availability.filter((a) => a.mechanic_id === selectedMechanic)
    : availability

  const inputClass =
    "w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:bg-white transition"

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-4 border-violet-100" />
          <div className="absolute inset-0 rounded-full border-4 border-violet-600 border-t-transparent animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            Mechanics &amp; Availability
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage mechanics list, work shift schedules, and availability status.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white text-xs font-bold rounded-xl transition shadow-sm shadow-violet-600/20"
        >
          <Plus size={16} /> Add Shift Schedule
        </button>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Mechanics Sidebar */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="dashboard-card p-4 h-fit"
        >
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">
            Team Members ({mechanics.length})
          </h2>

          <div className="space-y-1.5 mb-4">
            <button
              onClick={() => setSelectedMechanic(null)}
              className={`w-full p-2.5 rounded-xl text-xs font-bold text-left transition ${
                selectedMechanic === null
                  ? 'bg-violet-50 text-violet-700 border border-violet-200/60'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              All Mechanics
            </button>
            {mechanics.map((mechanic) => (
              <div key={mechanic.id} className="flex items-center gap-1.5">
                <button
                  onClick={() => setSelectedMechanic(mechanic.id)}
                  className={`flex-1 p-2.5 rounded-xl text-left transition border ${
                    selectedMechanic === mechanic.id
                      ? 'bg-violet-50 text-violet-700 border-violet-200/60 font-bold'
                      : 'border-transparent text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-900 truncate">{mechanic.name}</p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{mechanic.email}</p>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteConfirm(mechanic)
                  }}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition"
                  title="Remove Mechanic"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-4">
          {/* Add Shift Form */}
          <AnimatePresence>
            {showAddForm && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="dashboard-card p-6"
              >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                    Add Shift Schedule
                  </h3>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Mechanic</label>
                    <select
                      value={formData.mechanic_id}
                      onChange={(e) => setFormData({ ...formData, mechanic_id: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">Select a mechanic</option>
                      {mechanics.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Day of Week</label>
                    <select
                      value={formData.day_of_week}
                      onChange={(e) => setFormData({ ...formData, day_of_week: e.target.value })}
                      className={inputClass}
                    >
                      {daysOfWeek.map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Start Time</label>
                      <input
                        type="time"
                        value={formData.start_time}
                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">End Time</label>
                      <input
                        type="time"
                        value={formData.end_time}
                        onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setShowAddForm(false)}
                      className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddAvailability}
                      className="flex-1 px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-bold rounded-xl transition shadow-sm shadow-violet-600/20"
                    >
                      Save Shift
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Availability Cards */}
          {filteredAvailability.length === 0 ? (
            <div className="dashboard-card p-12 text-center">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-xs font-semibold">
                {selectedMechanic ? `No shift schedules set for ${selectedMechanicData?.name}` : 'No mechanic shift schedules added yet'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAvailability.map((slot) => (
                <motion.div
                  key={slot.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="dashboard-card p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-bold text-slate-900 text-sm">
                        {typeof slot.day_of_week === "number"
                          ? daysOfWeek[slot.day_of_week] || slot.day_of_week
                          : slot.day_of_week}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                          slot.is_available
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${slot.is_available ? "bg-emerald-500" : "bg-slate-400"}`} />
                        {slot.is_available ? "Available" : "Unavailable"}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 font-medium mb-3">
                      Mechanic: <span className="font-semibold text-slate-700">{slot.mechanic_name}</span>
                    </p>

                    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-800 tabular-nums">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {slot.start_time} — {slot.end_time}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4 mt-4 border-t border-slate-100">
                    <button
                      onClick={() => handleToggleAvailability(slot.id, slot.is_available)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition ${
                        slot.is_available
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {slot.is_available ? 'Mark Unavailable' : 'Mark Available'}
                    </button>
                    <button
                      onClick={() => handleDeleteAvailability(slot.id)}
                      className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 transition"
                      title="Delete shift"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Mechanic Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="dashboard-card max-w-md w-full p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Delete Mechanic
                </h3>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-6 space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Are you sure you want to delete mechanic <span className="font-bold text-slate-900">{deleteConfirm.name}</span>?
                </p>
                <p className="text-xs text-slate-400">
                  To confirm, type <span className="font-mono font-bold text-slate-900">CONFIRM</span> below.
                </p>
                <input
                  type="text"
                  placeholder="Type CONFIRM"
                  value={confirmationInput}
                  onChange={(e) => setConfirmationInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-red-500 transition"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setDeleteConfirm(null)
                    setConfirmationInput('')
                  }}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteMechanic}
                  disabled={deleting || confirmationInput !== 'CONFIRM'}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition disabled:opacity-50 shadow-sm shadow-red-600/20"
                >
                  {deleting ? 'Deleting...' : 'Delete Mechanic'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default AdminMechanicAvailability
