/**
 * FieldOps customer app — register, wait for office verification, create jobs, track status.
 * API: src/config.ts. CMS: GET /api/v1/content?audience=customer.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { api, unwrapList } from './src/api'
import { cardShadow, colors, statusTone, tracker, trackerIndex } from './src/theme'
import { Spinner } from './src/spinner'

type Me = {
  id: string
  name: string
  email: string
  can_create_jobs?: boolean
  verification_status?: string | null
  verification_label?: string | null
  access_message?: string | null
  organization?: { name: string } | null
}

type Job = {
  id: string
  title: string
  status: string
  status_label?: string
  customer_status?: string
  description?: string | null
  site?: { address?: string }
  assignees?: { name: string }[]
}

type Invoice = { id: string; total_cents: number; status_label?: string; number?: string | null }
type Notice = { id: string; title: string; body: string; unread: boolean; created_at?: string; type_label?: string }
type ContentPage = { slug: string; title: string; body?: string; audience?: string }

const TOKEN_KEY = 'fieldops.customer.token'
type Tab = 'home' | 'new' | 'jobs' | 'alerts'

function CustomerApp() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const padH = width < 380 ? 16 : width > 428 ? 24 : 20
  const compact = width < 380
  const [token, setToken] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [tab, setTab] = useState<Tab>('home')
  const [me, setMe] = useState<Me | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [pages, setPages] = useState<ContentPage[]>([])
  const [openPage, setOpenPage] = useState<ContentPage | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [street, setStreet] = useState('')
  const [zip, setZip] = useState('')
  const [city, setCity] = useState('Frankfurt am Main')

  const [step, setStep] = useState(1)
  const [jobForm, setJobForm] = useState({ title: '', description: '', street: '', when: 'Vormittag', urgency: 'normal' as 'normal' | 'notdienst' })

  const loadPages = useCallback(async () => {
    const list = await api<ContentPage[]>('/api/v1/content?audience=customer', null).catch(() => [])
    setPages(Array.isArray(list) ? list : [])
  }, [])

  const openContent = async (slug: string) => {
    try {
      const page = await api<ContentPage>(`/api/v1/content/${slug}`, null)
      setOpenPage(page)
    } catch (e) {
      Alert.alert('Inhalt', e instanceof Error ? e.message : 'Seite nicht gefunden')
    }
  }

  const load = useCallback(async (auth: string) => {
    const [user, jobRes, invRes, noteRes] = await Promise.all([
      api<Me>('/api/v1/me', auth),
      api<{ data?: Job[] }>('/api/v1/jobs', auth).catch(() => ({ data: [] })),
      api<{ data?: Invoice[] }>('/api/v1/invoices', auth).catch(() => ({ data: [] })),
      api<Notice[]>('/api/v1/notifications', auth).catch(() => []),
    ])
    setMe(user)
    setJobs(unwrapList(jobRes))
    setInvoices(unwrapList(invRes))
    setNotices(Array.isArray(noteRes) ? noteRes : [])
  }, [])

  useEffect(() => {
    void loadPages()
    AsyncStorage.getItem(TOKEN_KEY).then(async t => {
      if (t) {
        setToken(t)
        try {
          await load(t)
        } catch {
          await AsyncStorage.removeItem(TOKEN_KEY)
          setToken(null)
        }
      }
      setBooting(false)
    })
  }, [load, loadPages])

  const persist = async (next: string, user?: Me) => {
    await AsyncStorage.setItem(TOKEN_KEY, next)
    setToken(next)
    if (user) setMe(user)
    await load(next)
  }

  const login = async () => {
    setBusy(true)
    try {
      const r = await api<{ token: string; user: Me }>('/api/v1/auth/login', null, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      await persist(r.token, r.user)
    } catch (e) {
      Alert.alert('Anmeldung', e instanceof Error ? e.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  const register = async () => {
    setBusy(true)
    try {
      const r = await api<{ token: string; user: Me }>('/api/v1/auth/register', null, {
        method: 'POST',
        body: JSON.stringify({ name, email, password, phone, street, zip, city }),
      })
      await persist(r.token, r.user)
      setTab('home')
    } catch (e) {
      Alert.alert('Registrierung', e instanceof Error ? e.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    if (token) await api('/api/v1/auth/logout', token, { method: 'POST' }).catch(() => {})
    await AsyncStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setMe(null)
    setJobs([])
  }

  const refresh = async () => {
    if (!token) return
    setRefreshing(true)
    try {
      await load(token)
    } finally {
      setRefreshing(false)
    }
  }

  const createJob = async () => {
    if (!token) return
    setBusy(true)
    try {
      await api('/api/v1/jobs', token, {
        method: 'POST',
        body: JSON.stringify({
          title: jobForm.title || jobForm.description || 'Serviceanfrage',
          description: `${jobForm.description}\nZeitfenster: ${jobForm.when}`.trim(),
          urgency: jobForm.urgency,
          street: jobForm.street,
          zip,
          city,
        }),
      })
      setStep(1)
      setJobForm({ title: '', description: '', street: jobForm.street, when: 'Vormittag', urgency: 'normal' })
      setTab('jobs')
      await load(token)
      Alert.alert('Gesendet', 'Das Büro hat Ihre Anfrage erhalten.')
    } catch (e) {
      Alert.alert('Auftrag', e instanceof Error ? e.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  const markNotice = async (id: string) => {
    if (!token) return
    await api(`/api/v1/notifications/${id}/read`, token, { method: 'POST' }).catch(() => {})
    await load(token)
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} translucent={false} />
        <View style={styles.center}>
          <Spinner label="Wird geladen…" />
        </View>
      </SafeAreaView>
    )
  }

  if (openPage) {
    return <ContentReader page={openPage} onClose={() => setOpenPage(null)} />
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} translucent={false} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[styles.authPad, { paddingHorizontal: padH, paddingBottom: 48 + insets.bottom }]} keyboardShouldPersistTaps="handled">
            <View style={styles.brandMark} />
            <Text style={styles.kicker}>FIELDOPS KUNDE</Text>
            <Text style={[styles.h1, compact && { fontSize: 28, lineHeight: 34 }]}>Wärme, Wasser,{'\n'}wenn Sie uns brauchen.</Text>
            <Text style={styles.lead}>Ihr SHK-Betrieb bestätigt neue Konten. Danach legen Sie Aufträge selbst an.</Text>
            <View style={styles.segment}>
              {(['login', 'register'] as const).map(item => (
                <Pressable key={item} style={[styles.segmentBtn, mode === item && styles.segmentOn]} onPress={() => setMode(item)}>
                  <Text style={[styles.segmentText, mode === item && styles.segmentTextOn]}>{item === 'login' ? 'Anmelden' : 'Registrieren'}</Text>
                </Pressable>
              ))}
            </View>
            {mode === 'register' && (
              <>
                <Field label="Name" value={name} onChange={setName} />
                <Field label="Telefon" value={phone} onChange={setPhone} keyboard="phone-pad" />
                <Field label="Straße" value={street} onChange={setStreet} />
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Field label="PLZ" value={zip} onChange={setZip} keyboard="number-pad" />
                  </View>
                  <View style={{ flex: 1.4 }}>
                    <Field label="Ort" value={city} onChange={setCity} />
                  </View>
                </View>
              </>
            )}
            <Field label="E-Mail" value={email} onChange={setEmail} keyboard="email-address" autoCap="none" />
            <Field label="Passwort" value={password} onChange={setPassword} secure />
            <Pressable
              accessibilityRole="button"
              android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
              style={({ pressed }) => [styles.cta, busy && { opacity: 0.6 }, pressed && { opacity: 0.92 }]}
              onPress={mode === 'login' ? login : register}
              disabled={busy}
            >
              {busy ? <Spinner compact /> : <Text style={styles.ctaText}>{mode === 'login' ? 'Anmelden' : 'Konto anlegen'}</Text>}
            </Pressable>
            <LegalLinks pages={pages} onOpen={openContent} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  const verified = Boolean(me?.can_create_jobs)
  const next = jobs[0]
  const unread = notices.filter(n => n.unread).length

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <ScrollView
        contentContainerStyle={[styles.pad, { paddingHorizontal: padH, paddingBottom: 120 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.navy} />}
      >
        <View style={styles.topBar}>
          <View>
            <Text style={styles.kicker}>{me?.organization?.name ?? 'FIELDOPS'}</Text>
            <Text style={styles.hello}>Hallo{me?.name ? `, ${me.name.split(' ')[0]}` : ''}</Text>
          </View>
          <Pressable onPress={logout} hitSlop={8}>
            <Text style={styles.link}>Abmelden</Text>
          </Pressable>
        </View>

        {!verified ? (
          <View style={styles.waitCard}>
            <View style={styles.waitRing}>
              <View style={styles.waitDot} />
            </View>
            <Text style={styles.waitTitle}>{me?.verification_label ?? 'Wartet auf Freigabe'}</Text>
            <Text style={styles.waitBody}>
              {me?.access_message || 'Das Büro prüft Ihr Konto. Sobald es bestätigt ist, können Sie Aufträge anlegen.'}
            </Text>
            <Pressable style={styles.ghost} onPress={refresh}>
              <Text style={styles.ghostText}>Status prüfen</Text>
            </Pressable>
            <LegalLinks pages={pages} onOpen={openContent} />
          </View>
        ) : tab === 'home' ? (
          <>
            {next ? (
              <View style={styles.hero}>
                <Text style={styles.heroKicker}>Nächster Termin</Text>
                <Text style={styles.heroTitle}>{next.title}</Text>
                <Text style={styles.muted}>{next.site?.address}</Text>
                {next.assignees?.[0] && <Text style={styles.muted}>Monteur: {next.assignees[0].name}</Text>}
                <Tracker status={next.status} />
              </View>
            ) : (
              <View style={styles.hero}>
                <Text style={styles.heroTitle}>Kein offener Termin</Text>
                <Text style={styles.muted}>Legen Sie einen Auftrag an — das Büro plant den Einsatz.</Text>
              </View>
            )}
            <Pressable style={styles.cta} onPress={() => setTab('new')}>
              <Text style={styles.ctaText}>Neuen Auftrag anlegen</Text>
            </Pressable>
            <Text style={styles.h2}>Rechnungen</Text>
            {invoices.slice(0, 3).map(inv => (
              <View key={inv.id} style={styles.card}>
                <Text style={styles.amount}>{(inv.total_cents / 100).toFixed(2).replace('.', ',')} €</Text>
                <Text style={styles.muted}>{inv.status_label} · {inv.number || 'Offen'}</Text>
              </View>
            ))}
            {invoices.length === 0 && <Text style={styles.muted}>Noch keine Rechnungen.</Text>}
            <Text style={styles.h2}>Informationen</Text>
            <LegalLinks pages={pages} onOpen={openContent} stacked />
          </>
        ) : tab === 'new' ? (
          <View>
            <Text style={styles.h2}>Neuer Auftrag</Text>
            <View style={styles.steps}>
              {[1, 2, 3].map(n => (
                <View key={n} style={[styles.stepPip, step >= n && styles.stepPipOn]} />
              ))}
            </View>
            {step === 1 && (
              <>
                <Field label="Wo ist der Schaden?" value={jobForm.street} onChange={v => setJobForm({ ...jobForm, street: v })} />
                <Pressable style={styles.cta} onPress={() => setStep(2)}>
                  <Text style={styles.ctaText}>Weiter</Text>
                </Pressable>
              </>
            )}
            {step === 2 && (
              <>
                <Field label="Was ist passiert?" value={jobForm.description} onChange={v => setJobForm({ ...jobForm, description: v, title: v.slice(0, 80) })} />
                <View style={styles.row}>
                  <Chip label="Normal" on={jobForm.urgency === 'normal'} onPress={() => setJobForm({ ...jobForm, urgency: 'normal' })} />
                  <Chip label="Notdienst" on={jobForm.urgency === 'notdienst'} danger onPress={() => setJobForm({ ...jobForm, urgency: 'notdienst' })} />
                </View>
                <Pressable style={styles.cta} onPress={() => setStep(3)}>
                  <Text style={styles.ctaText}>Weiter</Text>
                </Pressable>
              </>
            )}
            {step === 3 && (
              <>
                <Text style={styles.label}>Wann?</Text>
                <View style={styles.rowWrap}>
                  {['Sofort', 'Vormittag', 'Nachmittag', 'Morgen'].map(w => (
                    <Chip key={w} label={w} on={jobForm.when === w} onPress={() => setJobForm({ ...jobForm, when: w })} />
                  ))}
                </View>
                <Pressable style={[styles.cta, busy && { opacity: 0.85 }]} onPress={createJob} disabled={busy}>
                  {busy ? <Spinner compact /> : <Text style={styles.ctaText}>Absenden</Text>}
                </Pressable>
              </>
            )}
          </View>
        ) : tab === 'jobs' ? (
          <>
            <Text style={styles.h2}>Ihre Aufträge</Text>
            {jobs.map(job => (
              <View key={job.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{job.title}</Text>
                  <Badge status={job.status} fallback={job.customer_status} />
                </View>
                <Text style={styles.muted}>{job.site?.address}</Text>
                <Tracker status={job.status} compact />
              </View>
            ))}
            {jobs.length === 0 && <Text style={styles.muted}>Noch keine Aufträge.</Text>}
          </>
        ) : (
          <>
            <Text style={styles.h2}>Mitteilungen</Text>
            {notices.map(n => (
              <Pressable key={n.id} style={[styles.card, n.unread && styles.unread]} onPress={() => n.unread && markNotice(n.id)}>
                <Text style={styles.noticeType}>{n.type_label}</Text>
                <Text style={styles.cardTitle}>{n.title}</Text>
                <Text style={styles.muted}>{n.body}</Text>
              </Pressable>
            ))}
            {notices.length === 0 && <Text style={styles.muted}>Keine Mitteilungen.</Text>}
          </>
        )}
      </ScrollView>
      {verified && (
        <View style={[styles.tabBar, { paddingBottom: Math.max(8, insets.bottom) }]}>
          <TabItem label="Home" on={tab === 'home'} onPress={() => setTab('home')} />
          <TabItem label="Auftrag" on={tab === 'new'} onPress={() => setTab('new')} />
          <TabItem label="Status" on={tab === 'jobs'} onPress={() => setTab('jobs')} />
          <TabItem label="Post" on={tab === 'alerts'} onPress={() => setTab('alerts')} badge={unread} />
        </View>
      )}
      {busy && (
        <View style={styles.busyOverlay}>
          <Spinner label="Bitte warten…" />
        </View>
      )}
    </SafeAreaView>
  )
}

function LegalLinks({
  pages,
  onOpen,
  stacked,
}: {
  pages: ContentPage[]
  onOpen: (slug: string) => void
  stacked?: boolean
}) {
  return (
    <View style={[styles.legalWrap, stacked && { flexDirection: 'column', alignItems: 'stretch', marginTop: 8 }]}>
      {pages.map(page => (
        <Pressable key={page.slug} onPress={() => onOpen(page.slug)} style={stacked ? styles.legalCard : styles.legalItem}>
          <Text style={stacked ? styles.legalCardTitle : styles.legalText}>{page.title}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function ContentReader({ page, onClose }: { page: ContentPage; onClose: () => void }) {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <View style={styles.topBar}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.link}>Zurück</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={styles.kicker}>FIELDOPS</Text>
        <Text style={styles.h1}>{page.title}</Text>
        <PageBody body={page.body ?? ''} />
      </ScrollView>
    </SafeAreaView>
  )
}

function PageBody({ body }: { body: string }) {
  return (
    <View style={{ marginTop: 8 }}>
      {body.split('\n').map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <Text key={i} style={styles.pageH}>
              {line.slice(3)}
            </Text>
          )
        }
        if (!line.trim()) {
          return <View key={i} style={{ height: 8 }} />
        }
        return (
          <Text key={i} style={styles.pageP}>
            {line}
          </Text>
        )
      })}
    </View>
  )
}

function Field({
  label, value, onChange, secure, keyboard, autoCap,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  secure?: boolean
  keyboard?: 'default' | 'email-address' | 'phone-pad' | 'number-pad'
  autoCap?: 'none' | 'sentences'
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        keyboardType={keyboard}
        autoCapitalize={autoCap ?? (keyboard === 'email-address' ? 'none' : 'sentences')}
        autoCorrect={false}
        placeholderTextColor={colors.muted}
        includeFontPadding={false}
        textAlignVertical="center"
        underlineColorAndroid="transparent"
        accessibilityLabel={label}
      />
    </View>
  )
}

function Tracker({ status, compact }: { status: string; compact?: boolean }) {
  const idx = trackerIndex(status)
  return (
    <View style={[styles.track, compact && { marginTop: 10 }]}>
      {tracker.map((label, i) => (
        <View key={label} style={styles.trackCol}>
          <View style={[styles.trackDot, i <= idx && styles.trackDotOn]} />
          <Text style={[styles.trackLabel, i === idx && styles.trackLabelOn]}>{label}</Text>
        </View>
      ))}
    </View>
  )
}

function Badge({ status, fallback }: { status: string; fallback?: string }) {
  const tone = statusTone[status]
  return (
    <View style={[styles.badge, { backgroundColor: tone?.bg ?? '#EEF2F6' }]}>
      <Text style={[styles.badgeText, { color: tone?.fg ?? colors.muted }]}>{fallback || tone?.label || status}</Text>
    </View>
  )
}

function Chip({ label, on, onPress, danger }: { label: string; on: boolean; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      android_ripple={{ color: 'rgba(36,52,77,0.08)' }}
      style={[styles.chip, on && (danger ? styles.chipDanger : styles.chipOn)]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, on && { color: colors.white }]}>{label}</Text>
    </Pressable>
  )
}

function TabItem({ label, on, onPress, badge }: { label: string; on: boolean; onPress: () => void; badge?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} android_ripple={{ color: 'rgba(36,52,77,0.08)' }} style={styles.tabItem} onPress={onPress} hitSlop={8}>
      <View style={[styles.tabPip, on && styles.tabPipOn]} />
      <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{label}</Text>
      {!!badge && badge > 0 && (
        <View style={styles.tabBadge}>
          <Text style={styles.tabBadgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
    </Pressable>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <CustomerApp />
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  authPad: { padding: 24, paddingTop: 36, paddingBottom: 48 },
  pad: { padding: 20, paddingBottom: 120 },
  brandMark: { width: 48, height: 6, borderRadius: 99, backgroundColor: colors.gold, marginBottom: 18 },
  kicker: { color: colors.gold, letterSpacing: 2.4, fontSize: 11, fontWeight: '700' },
  h1: { color: colors.ink, fontSize: 32, fontWeight: '700', marginTop: 8, lineHeight: 38 },
  hello: { color: colors.ink, fontSize: 26, fontWeight: '700', marginTop: 4 },
  lead: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 18 },
  h2: { color: colors.ink, fontSize: 18, fontWeight: '700', marginTop: 22, marginBottom: 10 },
  muted: { color: colors.muted, marginTop: 4, lineHeight: 20 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    minHeight: 52,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  segment: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: colors.line, marginBottom: 8 },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  segmentOn: { backgroundColor: colors.navy },
  segmentText: { fontWeight: '600', color: colors.muted },
  segmentTextOn: { color: colors.white },
  cta: {
    backgroundColor: colors.navy,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 18,
    minHeight: 56,
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  ctaText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  ghost: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  ghostText: { color: colors.navy, fontWeight: '700' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  link: { color: colors.navy, fontWeight: '600' },
  waitCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    ...cardShadow,
  },
  waitRing: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  waitDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.gold },
  waitTitle: { fontSize: 20, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  waitBody: { marginTop: 8, textAlign: 'center', color: colors.muted, lineHeight: 22 },
  hero: { backgroundColor: colors.white, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.line, ...cardShadow },
  heroKicker: { color: colors.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1.6, marginBottom: 6 },
  heroTitle: { fontSize: 22, fontWeight: '700', color: colors.ink },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 16, marginTop: 10, borderWidth: 1, borderColor: colors.line, ...cardShadow },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, flex: 1, paddingRight: 8 },
  amount: { fontSize: 26, fontWeight: '700', color: colors.ink },
  unread: { borderColor: colors.gold },
  noticeType: { color: colors.gold, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: 'center', backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipDanger: { backgroundColor: colors.rose, borderColor: colors.rose },
  chipText: { fontWeight: '600', color: colors.ink },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  steps: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  stepPip: { flex: 1, height: 4, borderRadius: 99, backgroundColor: colors.line },
  stepPipOn: { backgroundColor: colors.navy },
  track: { flexDirection: 'row', marginTop: 16, justifyContent: 'space-between' },
  trackCol: { alignItems: 'center', flex: 1 },
  trackDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.line, marginBottom: 6 },
  trackDotOn: { backgroundColor: colors.navy },
  trackLabel: { fontSize: 10, color: colors.muted },
  trackLabelOn: { color: colors.ink, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.white,
    paddingTop: 8,
    minHeight: 56,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44 },
  tabPip: { width: 18, height: 3, borderRadius: 99, backgroundColor: 'transparent' },
  tabPipOn: { backgroundColor: colors.gold },
  tabLabel: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  tabLabelOn: { color: colors.ink },
  tabBadge: { position: 'absolute', right: 18, top: -2, backgroundColor: colors.rose, borderRadius: 8, minWidth: 16, paddingHorizontal: 4 },
  tabBadgeText: { color: colors.white, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(244,239,230,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
  legalWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 20 },
  legalItem: { paddingVertical: 8, paddingHorizontal: 6 },
  legalText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  legalCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  legalCardTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  pageH: { color: colors.ink, fontSize: 17, fontWeight: '700', marginTop: 18, marginBottom: 6 },
  pageP: { color: colors.muted, fontSize: 15, lineHeight: 22 },
})
