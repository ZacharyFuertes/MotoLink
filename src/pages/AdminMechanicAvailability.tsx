import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, Clock, Plus, Trash2, X, UserPlus, Mail, User, Search, Users, CheckCircle2 } from 'lucide-react'

import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../services/supabaseClient'
import { getShopByOwnerId } from '../services/shopService'
import { normalizeTime } from '../utils/dateTime'
import { sendBookingUpdatedEmail, sendRescheduleNoticeToCustomer } from '../services/notificationService'

interface Mechanic {
  id: string
  name: string
  email: string
  is_active: boolean
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

interface AssignedAppointment {
  id: string
  booking_id?: string | null
  mechanic_id: string | null
  scheduled_date: string
  scheduled_time: string | null
  service_type: string
  status: string
  mechanic_preference: 'specific' | 'any'
}

interface AdminMechanicAvailabilityProps {
  onNavigate?: (page: string) => void
}

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const formatTime = (time: string) => {
  const [hours = '0', minutes = '00'] = time.split(':')
  const hour = Number(hours)
  return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`
}

const AdminMechanicAvailability: React.FC<AdminMechanicAvailabilityProps> = ({ onNavigate }) => {
  const { user } = useAuth()
  const [mechanics, setMechanics] = useState<Mechanic[]>([])
  const [availability, setAvailability] = useState<Availability[]>([])
  const [assignedAppointments, setAssignedAppointments] = useState<AssignedAppointment[]>([])
  const [resolvedShopId, setResolvedShopId] = useState<string | null>(user?.shop_id || null)
  const [loading, setLoading] = useState(true)
  const [selectedMechanic, setSelectedMechanic] = useState<string | null>(null)
  const [mechanicSearch, setMechanicSearch] = useState('')
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>('all')
  const [dayFilter, setDayFilter] = useState('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [showAddMechanic, setShowAddMechanic] = useState(false)
  const [mechanicAction, setMechanicAction] = useState<Mechanic | null>(null)
  const [updatingMechanicStatus, setUpdatingMechanicStatus] = useState(false)
  const [deactivationAction, setDeactivationAction] = useState<'reassign' | 'unassign'>('unassign')
  const [replacementMechanicId, setReplacementMechanicId] = useState('')
  const [formData, setFormData] = useState({
    mechanic_id: '',
    day_of_week: 'Monday',
    start_time: '08:00',
    end_time: '17:00',
  })
  const [mechanicForm, setMechanicForm] = useState({
    name: '',
    email: '',
    day_of_week: 'Monday',
    start_time: '08:00',
    end_time: '17:00',
  })
  const [creatingMechanic, setCreatingMechanic] = useState(false)
  const [mechanicError, setMechanicError] = useState('')

  useEffect(() => {
    if (user?.role === 'admin') return;
    if (user?.role !== 'owner') {
      onNavigate && onNavigate('dashboard')
    }
  }, [user?.role])

  useEffect(() => {
    if (user?.id) void fetchData()
  }, [user?.id, user?.shop_id])

  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`mechanic-assignment-changes-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        void fetchData()
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [user?.id, user?.shop_id])

  const fetchData = async () => {
    try {
      setLoading(true)
      let ownerShopId = user?.shop_id || null
      if (!ownerShopId && user?.id) {
        const ownerShop = await getShopByOwnerId(user.id)
        ownerShopId = ownerShop?.id || null
      }
      setResolvedShopId(ownerShopId)
      if (!ownerShopId) {
        setMechanics([])
        setAvailability([])
        setAssignedAppointments([])
        return
      }

      let mechQuery = supabase
        .from('users')
        .select('id, name, email, is_active')
        .eq('role', 'mechanic')

      if (ownerShopId) {
        mechQuery = mechQuery.eq('shop_id', ownerShopId)
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
          .eq('shop_id', ownerShopId)
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

      const { data: bookings, error: bookingError } = await supabase
        .from('appointments')
        .select('id, booking_id, mechanic_id, scheduled_date, scheduled_time, service_type, status, mechanic_preference')
        .eq('shop_id', ownerShopId)
        .not('mechanic_id', 'is', null)
        .in('status', ['pending', 'confirmed', 'in_progress'])
        .order('scheduled_date', { ascending: true })
      if (bookingError) throw bookingError
      setAssignedAppointments((bookings || []) as AssignedAppointment[])
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
    if (formData.end_time <= formData.start_time) {
      alert('End time must be later than start time.')
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
            shop_id: resolvedShopId || user?.shop_id || null,
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
      setSelectedMechanic(formData.mechanic_id)
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

  const handleCreateMechanic = async () => {
    setMechanicError('')
    if (!mechanicForm.name || !mechanicForm.email) {
      setMechanicError('Please fill in the name and email.')
      return
    }

    setCreatingMechanic(true)
    const ownerShopId = resolvedShopId || user?.shop_id || null
    try {
      // Capture the owner's session BEFORE signUp creating the mechanic's
      // auth account swaps the active session to the new user, so we restore
      // the owner's session afterwards.
      const { data: ownerSess } = await supabase.auth.getSession()
      const ownerSession = ownerSess.session

      // The mechanic role is data-layer only (no login portal), so the
      // password is auto-generated and never shown/used.
      const autoPassword = 'MotoLink_' + Math.random().toString(36).slice(2, 14)

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: mechanicForm.email,
        password: autoPassword,
        options: { data: { full_name: mechanicForm.name } },
      })
      if (authError) throw authError
      if (!authData.user) throw new Error('Failed to create mechanic account')

      // NOTE: the handle_new_user trigger already inserted a public.users row
      // with role 'customer'. A plain insert would 23505 (duplicate key) and
      // leave the mechanic stuck as customer. Replace it via upsert while the
      // mechanic's own session is active (RLS "update own profile" passes),
      // forcing role=mechanic + the owner's shop_id.
      const { error: insertError } = await supabase
        .from('users')
        .upsert(
          {
            id: authData.user.id,
            email: mechanicForm.email,
            name: mechanicForm.name,
            role: 'mechanic',
            shop_id: ownerShopId,
          },
          { onConflict: 'id' },
        )
      if (insertError) throw insertError

      const dayIdx = daysOfWeek.indexOf(mechanicForm.day_of_week)
      const { error: availError } = await supabase.from('mechanic_availability').insert({
        mechanic_id: authData.user.id,
        day_of_week: dayIdx,
        start_time: mechanicForm.start_time,
        end_time: mechanicForm.end_time,
        is_available: true,
        shop_id: ownerShopId,
      })
      if (availError) throw availError

      // Restore the owner's session (signUp replaced it with the mechanic's)
      if (ownerSession) {
        await supabase.auth.setSession({
          access_token: ownerSession.access_token,
          refresh_token: ownerSession.refresh_token,
        })
      }

      setShowAddMechanic(false)
      setMechanicForm({
        name: '',
        email: '',
        day_of_week: 'Monday',
        start_time: '08:00',
        end_time: '17:00',
      })
      await fetchData()
    } catch (err: any) {
      let message = err?.message || 'Failed to create mechanic'
      if (message.includes('User already registered')) {
        message = 'This email is already registered.'
      }
      setMechanicError(message)
    } finally {
      setCreatingMechanic(false)
    }
  }

  const isUpcomingBooking = (booking: AssignedAppointment) => {
    const time = booking.scheduled_time || '00:00'
    const startsAt = new Date(`${booking.scheduled_date}T${normalizeTime(time)}:00+08:00`)
    return Number.isFinite(startsAt.getTime()) && startsAt.getTime() >= Date.now()
  }

  const upcomingBookings = (mechanic: Mechanic) => assignedAppointments.filter((booking) =>
    booking.mechanic_id === mechanic.id &&
    ['pending', 'confirmed', 'in_progress'].includes(booking.status) &&
    isUpcomingBooking(booking),
  )

  const hasInProgressBooking = (mechanic: Mechanic) => assignedAppointments.some((booking) =>
    booking.mechanic_id === mechanic.id && booking.status === 'in_progress',
  )

  const hasConfirmedSpecificBooking = (mechanic: Mechanic) => upcomingBookings(mechanic).some((booking) =>
    booking.status === 'confirmed' && booking.mechanic_preference === 'specific',
  )

  const handleDeactivateMechanic = async () => {
    if (!mechanicAction) return
    if (hasInProgressBooking(mechanicAction) || hasConfirmedSpecificBooking(mechanicAction)) return

    setUpdatingMechanicStatus(true)
    try {
      const { data, error } = await supabase.rpc('deactivate_mechanic', {
        p_mechanic_id: mechanicAction.id,
        p_action: deactivationAction,
        p_replacement_mechanic_id: deactivationAction === 'reassign' ? replacementMechanicId : null,
      })
      if (error) throw error

      const result = data as { affected_appointment_ids?: string[] } | null
      const ids = result?.affected_appointment_ids || []
      const notificationResults = await Promise.allSettled(ids.map((appointmentId) =>
        deactivationAction === 'reassign'
          ? sendRescheduleNoticeToCustomer(appointmentId, 'reassigned')
          : sendBookingUpdatedEmail(appointmentId),
      ))
      const failedNotifications = notificationResults.filter((item) =>
        item.status === 'rejected' || (!item.value.success && !item.value.skipped && !item.value.notConfigured),
      ).length
      setMechanics((current) => current.map((item) => item.id === mechanicAction.id ? { ...item, is_active: false } : item))
      setMechanicAction(null)
      if (selectedMechanic === mechanicAction.id) setSelectedMechanic(null)
      await fetchData()
      alert(failedNotifications
        ? `Mechanic deactivated. ${failedNotifications} customer email notification(s) could not be sent.`
        : 'Mechanic deactivated. Affected customers were notified by email where a contact is available.')
    } catch (err: any) {
      console.error('Error deactivating mechanic:', err)
      alert(err?.message || 'Could not deactivate this mechanic.')
    } finally {
      setUpdatingMechanicStatus(false)
    }
  }

  const handleReactivateMechanic = async (mechanic: Mechanic) => {
    setUpdatingMechanicStatus(true)
    try {
      const { error } = await supabase.rpc('reactivate_mechanic', { p_mechanic_id: mechanic.id })
      if (error) throw error
      setMechanics((current) => current.map((item) => item.id === mechanic.id ? { ...item, is_active: true } : item))
      await fetchData()
    } catch (err: any) {
      console.error('Error reactivating mechanic:', err)
      alert(err?.message || 'Could not reactivate this mechanic.')
    } finally {
      setUpdatingMechanicStatus(false)
    }
  }

  const handleToggleAvailability = async (availabilityId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('mechanic_availability')
        .update({ is_available: !currentStatus })
        .eq('id', availabilityId)
        .eq('shop_id', resolvedShopId || user?.shop_id || null)

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
  const activeMechanicIds = new Set(mechanics.filter((mechanic) => mechanic.is_active).map((mechanic) => mechanic.id))
  const visibleMechanics = mechanics.filter((mechanic) =>
    `${mechanic.name} ${mechanic.email}`.toLowerCase().includes(mechanicSearch.toLowerCase()),
  )
  const mechanicAvailability = selectedMechanic
    ? selectedMechanicData?.is_active ? availability.filter((a) => a.mechanic_id === selectedMechanic) : []
    : availability.filter((slot) => activeMechanicIds.has(slot.mechanic_id))
  const filteredAvailability = mechanicAvailability.filter((slot) => {
    const dayName = typeof slot.day_of_week === 'number'
      ? daysOfWeek[slot.day_of_week]
      : slot.day_of_week
    const matchesAvailability = availabilityFilter === 'all' ||
      (availabilityFilter === 'available' ? slot.is_available : !slot.is_available)
    return matchesAvailability && (dayFilter === 'all' || dayName === dayFilter)
  }).sort((a, b) => {
    const dayA = typeof a.day_of_week === 'number' ? a.day_of_week : daysOfWeek.indexOf(a.day_of_week)
    const dayB = typeof b.day_of_week === 'number' ? b.day_of_week : daysOfWeek.indexOf(b.day_of_week)
    return dayA - dayB || a.start_time.localeCompare(b.start_time)
  })
  const activeAvailability = availability.filter((slot) => activeMechanicIds.has(slot.mechanic_id))
  const availableCount = activeAvailability.filter((slot) => slot.is_available).length
  const unavailableCount = activeAvailability.length - availableCount

  const inputClass =
    "w-full px-3.5 py-2.5 bg-moto-darker border border-moto-gray rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-moto-accent focus:bg-moto-darker focus:ring-2 focus:ring-moto-accent/20 transition"

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-4 border-moto-accent/20" />
          <div className="absolute inset-0 rounded-full border-4 border-moto-accent border-t-transparent animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-display uppercase tracking-wide" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            Mechanics &amp; Availability
          </h1>
          <p className="text-[13px] text-slate-300 mt-0.5">
            Manage mechanics list, work shift schedules, and availability status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setShowAddMechanic(!showAddMechanic)
              setShowAddForm(false)
            }}
            className="flex items-center gap-2 px-4 py-2 bg-moto-accent hover:bg-moto-accent-dark text-slate-950 text-[13px] font-bold rounded-xl transition shadow-lg shadow-moto-accent/25 hover:-translate-y-0.5"
          >
            <UserPlus size={16} /> Add New Mechanic
          </button>
          <button
            onClick={() => {
              setShowAddForm(!showAddForm)
              setShowAddMechanic(false)
              setFormData((current) => ({ ...current, mechanic_id: selectedMechanic || current.mechanic_id }))
            }}
            disabled={!mechanics.some((mechanic) => mechanic.is_active)}
            title={!mechanics.some((mechanic) => mechanic.is_active) ? 'Add or reactivate a mechanic before creating a shift' : undefined}
            className="flex items-center gap-2 rounded-xl bg-moto-gray px-4 py-2 text-[13px] font-bold text-white shadow-sm shadow-slate-800/20 transition hover:bg-moto-darker disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={16} /> Add Shift Schedule
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Active mechanics', value: mechanics.filter((mechanic) => mechanic.is_active).length, icon: Users, tone: 'text-moto-accent bg-moto-accent/10' },
          { label: 'Available shifts', value: availableCount, icon: CheckCircle2, tone: 'text-emerald-400 bg-emerald-500/10' },
          { label: 'Unavailable shifts', value: unavailableCount, icon: Clock, tone: 'text-amber-300 bg-amber-500/10' },
        ].map((stat) => (
          <div key={stat.label} className="dashboard-card flex items-center gap-3 p-4">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.tone}`}><stat.icon size={18} /></span>
            <div>
              <p className="text-xl font-black leading-none text-slate-100">{stat.value}</p>
              <p className="mt-1 text-xs font-medium text-slate-400">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Mechanics Sidebar */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="dashboard-card p-4 h-fit lg:sticky lg:top-4"
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-slate-200">Team members</h2>
            <span className="rounded-full bg-moto-gray/50 px-2 py-0.5 text-xs font-bold text-slate-300">{mechanics.length}</span>
          </div>

          <label className="relative mb-3 block">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={mechanicSearch}
              onChange={(event) => setMechanicSearch(event.target.value)}
              placeholder="Find a mechanic"
              aria-label="Search mechanics"
              className={`${inputClass} py-2 pl-9 text-xs`}
            />
          </label>

          <div className="max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
            <button
              onClick={() => setSelectedMechanic(null)}
              className={`w-full rounded-xl border p-2.5 text-left text-[13px] font-bold transition ${
                selectedMechanic === null
                  ? 'bg-moto-accent/15 text-moto-accent border border-moto-accent/30'
                  : 'border-transparent text-slate-300 hover:bg-moto-gray/40'
              }`}
            >
              <span className="flex items-center justify-between">Active mechanics <span className="text-[11px] opacity-70">{activeAvailability.length} shifts</span></span>
            </button>
            {visibleMechanics.map((mechanic) => {
              const shiftCount = mechanic.is_active ? availability.filter((slot) => slot.mechanic_id === mechanic.id).length : 0
              const bookingCount = assignedAppointments.filter((booking) => booking.mechanic_id === mechanic.id).length
              const isSelected = selectedMechanic === mechanic.id
              return (
              <div key={mechanic.id} className="flex items-center gap-1.5">
                <button
                  onClick={() => mechanic.is_active && setSelectedMechanic(mechanic.id)}
                  disabled={!mechanic.is_active}
                  className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border p-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
                    isSelected
                      ? 'bg-moto-accent/15 text-moto-accent border-moto-accent/30 font-bold'
                      : 'border-transparent text-slate-300 hover:bg-moto-gray/40'
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-moto-accent/15 text-xs font-black uppercase text-moto-accent">{mechanic.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-slate-100">{mechanic.name}{!mechanic.is_active && <span className="ml-2 text-[10px] font-bold uppercase text-amber-300">Inactive</span>}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-400">{mechanic.email}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    {mechanic.is_active ? <>
                      <span className="block rounded-full bg-moto-gray/50 px-2 py-0.5 text-[10px] font-bold text-slate-300">{shiftCount} shifts</span>
                      <span className={`mt-1 block text-[9px] font-semibold ${bookingCount ? 'text-amber-300' : 'text-slate-500'}`}>{bookingCount} assigned</span>
                    </> : <span className="block text-[10px] font-semibold text-amber-300">Inactive</span>}
                  </span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (mechanic.is_active) {
                      setDeactivationAction('unassign')
                      setReplacementMechanicId('')
                      setMechanicAction(mechanic)
                    } else {
                      void handleReactivateMechanic(mechanic)
                    }
                  }}
                  disabled={updatingMechanicStatus}
                  className={`p-1.5 rounded-lg transition ${mechanic.is_active ? 'hover:bg-amber-500/15 text-slate-300 hover:text-amber-300' : 'hover:bg-emerald-500/15 text-emerald-300 hover:text-emerald-200'}`}
                  title={mechanic.is_active ? 'Deactivate mechanic' : 'Reactivate mechanic'}
                  aria-label={mechanic.is_active ? `Deactivate ${mechanic.name}` : `Reactivate ${mechanic.name}`}
                >
                  {mechanic.is_active ? <X size={14} /> : <CheckCircle2 size={14} />}
                </button>
              </div>
            )})}
            {visibleMechanics.length === 0 && (
              <p className="rounded-lg px-3 py-5 text-center text-xs text-slate-400">No mechanics match that search.</p>
            )}
          </div>
        </motion.div>

        {/* Main Content */}
        <div className="min-w-0 space-y-4">
          {/* Add New Mechanic Form */}
          <AnimatePresence>
            {showAddMechanic && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="dashboard-card p-6"
              >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-moto-gray">
                  <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                    Add New Mechanic
                  </h3>
                  <button
                    onClick={() => setShowAddMechanic(false)}
                    className="p-1 rounded-lg text-slate-300 hover:text-moto-accent transition"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-4">
                  {mechanicError && (
                    <div className="px-4 py-3 rounded-xl text-[13px] font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
                      {mechanicError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Full Name</label>
                      <div className="relative">
                        <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                        <input
                          type="text"
                          value={mechanicForm.name}
                          onChange={(e) => setMechanicForm({ ...mechanicForm, name: e.target.value })}
                          placeholder="e.g. Juan Dela Cruz"
                          className={`${inputClass} pl-9`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Email Address</label>
                      <div className="relative">
                        <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                        <input
                          type="email"
                          value={mechanicForm.email}
                          onChange={(e) => setMechanicForm({ ...mechanicForm, email: e.target.value })}
                          placeholder="mechanic@shop.com"
                          className={`${inputClass} pl-9`}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-slate-300 mb-2">
                      Initial Availability
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">Day of Week</label>
                        <select
                          value={mechanicForm.day_of_week}
                          onChange={(e) => setMechanicForm({ ...mechanicForm, day_of_week: e.target.value })}
                          className={inputClass}
                        >
                          {daysOfWeek.map((day) => (
                            <option key={day} value={day}>
                              {day}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">Start Time</label>
                        <input
                          type="time"
                          value={mechanicForm.start_time}
                          onChange={(e) => setMechanicForm({ ...mechanicForm, start_time: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">End Time</label>
                        <input
                          type="time"
                          value={mechanicForm.end_time}
                          onChange={(e) => setMechanicForm({ ...mechanicForm, end_time: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 mt-2">
                      Add more shift schedules later with the "Add Shift Schedule" button.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setShowAddMechanic(false)}
                      className="flex-1 px-4 py-2 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateMechanic}
                      disabled={creatingMechanic}
                      className="flex-1 px-4 py-2 bg-moto-accent hover:bg-moto-accent-dark text-slate-950 text-[13px] font-bold rounded-xl transition shadow-sm shadow-moto-accent/25 disabled:opacity-60"
                    >
                      {creatingMechanic ? 'Creating...' : 'Create Mechanic'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Add Shift Form */}
          <AnimatePresence>
            {showAddForm && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="dashboard-card p-6"
              >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-moto-gray">
                  <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                    Add Shift Schedule
                  </h3>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="p-1 rounded-lg text-slate-300 hover:text-moto-accent transition"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Mechanic</label>
                    <select
                      value={formData.mechanic_id}
                      onChange={(e) => setFormData({ ...formData, mechanic_id: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">Select a mechanic</option>
                      {mechanics.filter((m) => m.is_active).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Day of Week</label>
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
                      <label className="block text-xs font-bold text-slate-300 mb-1">Start Time</label>
                      <input
                        type="time"
                        value={formData.start_time}
                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">End Time</label>
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
                      className="flex-1 px-4 py-2 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddAvailability}
                      className="flex-1 px-4 py-2 bg-moto-accent hover:bg-moto-accent-dark text-slate-950 text-[13px] font-bold rounded-xl transition shadow-sm shadow-moto-accent/25"
                    >
                      Save Shift
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Schedule filters */}
          <div className="dashboard-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-100">{selectedMechanicData ? `${selectedMechanicData.name}'s schedule` : 'Weekly schedule'}</h2>
              <p className="mt-0.5 text-xs text-slate-400">{filteredAvailability.length} of {mechanicAvailability.length} shifts shown</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={availabilityFilter}
                onChange={(event) => setAvailabilityFilter(event.target.value as typeof availabilityFilter)}
                aria-label="Filter by availability"
                className="rounded-lg border border-moto-gray bg-moto-darker px-3 py-2 text-xs font-semibold text-slate-200 outline-none focus:border-moto-accent"
              >
                <option value="all">All statuses</option>
                <option value="available">Available</option>
                <option value="unavailable">Unavailable</option>
              </select>
              <select
                value={dayFilter}
                onChange={(event) => setDayFilter(event.target.value)}
                aria-label="Filter by weekday"
                className="rounded-lg border border-moto-gray bg-moto-darker px-3 py-2 text-xs font-semibold text-slate-200 outline-none focus:border-moto-accent"
              >
                <option value="all">All days</option>
                {daysOfWeek.map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </div>
          </div>

          {/* Availability Cards */}
          {filteredAvailability.length === 0 ? (
            <div className="dashboard-card p-8 text-center sm:p-12">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-moto-accent/10 text-moto-accent"><Calendar size={23} /></span>
              <p className="text-sm font-bold text-slate-100">
                {mechanicAvailability.length === 0
                  ? selectedMechanic ? `No shifts for ${selectedMechanicData?.name}` : 'No shift schedules yet'
                  : 'No shifts match these filters'}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
                {mechanicAvailability.length === 0
                  ? 'Create a weekly shift so customers can see when your mechanics are available.'
                  : 'Try a different day or availability status.'}
              </p>
              {mechanicAvailability.length === 0 && mechanics.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setShowAddForm(true); setShowAddMechanic(false); if (selectedMechanic) setFormData((current) => ({ ...current, mechanic_id: selectedMechanic })) }}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-moto-accent px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-moto-accent-dark"
                >
                  <Plus size={15} /> Add a shift
                </button>
              )}
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
                      <span className="font-bold text-slate-100 text-sm">
                        {typeof slot.day_of_week === "number"
                          ? daysOfWeek[slot.day_of_week] || slot.day_of_week
                          : slot.day_of_week}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-bold ${
                          slot.is_available
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-moto-gray/40 text-slate-400"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${slot.is_available ? "bg-emerald-500" : "bg-slate-400"}`} />
                        {slot.is_available ? "Available" : "Unavailable"}
                      </span>
                    </div>

                    <p className="mb-3 text-[13px] font-medium text-slate-300">
                      Mechanic: <span className="font-semibold text-slate-100">{slot.mechanic_name}</span>
                    </p>

                    <div className="flex items-center gap-2 rounded-xl bg-moto-gray/40 p-3 text-[13px] font-bold text-slate-200 tabular-nums">
                      <Clock className="h-4 w-4 shrink-0 text-slate-400" />
                      <span>{formatTime(slot.start_time)} <span className="mx-1 text-slate-500">to</span> {formatTime(slot.end_time)}</span>
                    </div>

                    {(() => {
                      const slotDay = typeof slot.day_of_week === 'number'
                        ? slot.day_of_week
                        : daysOfWeek.indexOf(slot.day_of_week)
                      const mechanicBookings = assignedAppointments.filter((booking) => {
                        if (booking.mechanic_id !== slot.mechanic_id || !booking.scheduled_time) return false
                        const bookingDay = (new Date(`${booking.scheduled_date}T00:00:00`).getDay() + 6) % 7
                        const bookingTime = normalizeTime(booking.scheduled_time)
                        return bookingDay === slotDay &&
                          bookingTime >= normalizeTime(slot.start_time) &&
                          bookingTime <= normalizeTime(slot.end_time)
                      })
                      return (
                        <div className="mt-3 rounded-xl border border-moto-gray/70 bg-moto-darker/50 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active assignments</p>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${mechanicBookings.length ? 'bg-amber-500/10 text-amber-300' : 'bg-moto-gray/60 text-slate-400'}`}>
                              {mechanicBookings.length}
                            </span>
                          </div>
                          {mechanicBookings.length ? (
                            <div className="space-y-2">
                              {mechanicBookings.slice(0, 2).map((booking) => (
                                <div key={booking.id} className="flex items-start justify-between gap-2 text-[11px]">
                                  <span className="min-w-0">
                                    <span className="block truncate font-semibold text-slate-200">{booking.service_type || 'Service appointment'}</span>
                                    <span className="mt-0.5 block text-slate-400">
                                      {new Date(`${booking.scheduled_date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                      {booking.scheduled_time ? ` · ${formatTime(booking.scheduled_time)}` : ''}
                                    </span>
                                  </span>
                                  <span className="shrink-0 rounded-md bg-moto-gray/60 px-1.5 py-0.5 font-semibold text-slate-300">
                                    {booking.status.replace('_', ' ')}
                                  </span>
                                </div>
                              ))}
                              {mechanicBookings.length > 2 && <p className="text-[10px] text-slate-500">+{mechanicBookings.length - 2} more active booking(s)</p>}
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-500">No active appointments assigned.</p>
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  <div className="flex gap-2 pt-4 mt-4 border-t border-moto-gray">
                    <button
                      onClick={() => handleToggleAvailability(slot.id, slot.is_available)}
                      aria-label={`${slot.is_available ? 'Mark unavailable' : 'Mark available'} shift for ${slot.mechanic_name}`}
                      className={`flex-1 py-1.5 rounded-xl text-[13px] font-bold transition ${
                        slot.is_available
                          ? 'bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200'
                          : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400'
                      }`}
                    >
                      {slot.is_available ? 'Mark Unavailable' : 'Mark Available'}
                    </button>
                    <button
                      onClick={() => handleDeleteAvailability(slot.id)}
                      aria-label={`Delete ${typeof slot.day_of_week === 'number' ? daysOfWeek[slot.day_of_week] : slot.day_of_week} shift for ${slot.mechanic_name}`}
                      className="p-2 rounded-xl hover:bg-red-500/15 text-slate-300 hover:text-red-400 transition"
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

      {/* Deactivate mechanic and resolve eligible upcoming bookings */}
      <AnimatePresence>
        {mechanicAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => !updatingMechanicStatus && setMechanicAction(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="dashboard-card max-h-[90vh] max-w-xl w-full overflow-y-auto p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Deactivate Mechanic
                </h3>
                <button
                  onClick={() => setMechanicAction(null)}
                  className="p-1.5 rounded-xl hover:bg-moto-gray/40 text-slate-300 hover:text-moto-accent transition"
                  disabled={updatingMechanicStatus}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-5 space-y-3">
                <p className="text-[13px] text-slate-200 leading-relaxed">
                  Deactivate <span className="font-bold text-slate-100">{mechanicAction.name}</span>? Their profile, shifts, and booking history will be retained. There are <strong>{upcomingBookings(mechanicAction).length}</strong> upcoming pending/confirmed/in-progress booking(s).
                </p>
                {upcomingBookings(mechanicAction).length > 0 && (
                  <>
                    <label className="block text-xs font-bold text-slate-200">
                      Upcoming booking action
                      <select
                        value={deactivationAction}
                        onChange={(event) => setDeactivationAction(event.target.value as 'reassign' | 'unassign')}
                        className="mt-1.5 w-full rounded-xl border border-moto-gray bg-moto-darker px-3 py-2.5 text-sm text-slate-100"
                        disabled={updatingMechanicStatus}
                      >
                        <option value="unassign">Set unassigned and notify customers</option>
                        <option value="reassign">Reassign all to another active mechanic</option>
                      </select>
                    </label>
                    {deactivationAction === 'reassign' && (
                      <label className="block text-xs font-bold text-slate-200">
                        Replacement mechanic
                        <select
                          value={replacementMechanicId}
                          onChange={(event) => setReplacementMechanicId(event.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-moto-gray bg-moto-darker px-3 py-2.5 text-sm text-slate-100"
                          disabled={updatingMechanicStatus}
                        >
                          <option value="">Choose an active mechanic</option>
                          {mechanics.filter((mechanic) => mechanic.is_active && mechanic.id !== mechanicAction.id).map((mechanic) => (
                            <option key={mechanic.id} value={mechanic.id}>{mechanic.name}</option>
                          ))}
                        </select>
                        <span className="mt-1 block font-normal text-slate-400">The database validates shift coverage and overlap for every booking. If the replacement is unavailable for any one booking, the whole deactivation is rejected.</span>
                      </label>
                    )}
                    <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-moto-gray p-3">
                      {upcomingBookings(mechanicAction).map((booking) => (
                        <div key={booking.id} className="flex items-center justify-between gap-3 text-xs">
                          <span className="min-w-0 truncate text-slate-200">{booking.booking_id || booking.service_type || 'Booking'} · {booking.scheduled_date}{booking.scheduled_time ? ` ${formatTime(booking.scheduled_time)}` : ''}</span>
                          <span className="shrink-0 rounded-md bg-moto-gray/60 px-1.5 py-0.5 font-semibold text-slate-300">{booking.status.replace('_', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {hasInProgressBooking(mechanicAction) && (
                  <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">This mechanic has an in-progress booking. Complete it before deactivation.</p>
                )}
                {hasConfirmedSpecificBooking(mechanicAction) && (
                  <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">A confirmed booking where the customer chose this mechanic must be resolved through the customer reschedule/acceptance flow before deactivation.</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setMechanicAction(null)
                  }}
                  disabled={updatingMechanicStatus}
                  className="flex-1 px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleDeactivateMechanic()}
                  disabled={updatingMechanicStatus || hasInProgressBooking(mechanicAction) || hasConfirmedSpecificBooking(mechanicAction) || (upcomingBookings(mechanicAction).length > 0 && deactivationAction === 'reassign' && !replacementMechanicId)}
                  className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-[13px] font-bold rounded-xl transition disabled:opacity-50 shadow-sm shadow-amber-600/20"
                >
                  {updatingMechanicStatus ? 'Deactivating...' : 'Deactivate Mechanic'}
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
