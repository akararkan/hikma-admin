import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Err, Note } from '../components/ui'

/* Sign-in can take two legs. Leg 1 is the password. If the account has 2FA on, the
   server accepts the password but issues NO session — it hands back a short-lived
   `mfaToken` and waits for leg 2 (POST /api/v1/auth/login/2fa). These codes mean the
   challenge is already burned, so the only way forward is a fresh password. */
const CHALLENGE_DEAD = ['MFA_TOO_MANY_ATTEMPTS', 'MFA_CHALLENGE_INVALID']

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function LoginPage() {
  const { login, completeTwoFactor } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  // Leg 2 state. The mfaToken is a credential, so it lives here in memory only and
  // is never written to localStorage alongside the real tokens.
  const [challenge, setChallenge] = useState(null) // { mfaToken, expiresIn }
  const [code, setCode] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)

  const backToPassword = useCallback((message) => {
    setChallenge(null); setCode(''); setPassword(''); setSecondsLeft(0)
    setErr(message ? { message } : null)
  }, [])

  // Countdown on the code screen. `expiresIn` is the server's own challenge TTL.
  useEffect(() => {
    if (!challenge) return undefined
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [challenge])

  // When it lapses the challenge is gone server-side too — do not let them keep typing.
  useEffect(() => {
    if (challenge && secondsLeft <= 0) {
      backToPassword('That took too long. Please type your password again.')
    }
  }, [challenge, secondsLeft, backToPassword])

  const done = () => nav(loc.state?.from || '/', { replace: true })

  const submitPassword = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const res = await login(username, password)
      if (res?.mfaRequired) {
        // Both in one update so the countdown never starts from a stale 0.
        setChallenge(res); setSecondsLeft(res.expiresIn); setCode('')
      } else done()
    } catch (ex) { setErr(ex) } finally { setBusy(false) }
  }

  const submitCode = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      await completeTwoFactor(challenge.mfaToken, code.trim())
      done()
    } catch (ex) {
      if (CHALLENGE_DEAD.includes(ex?.errorCode)) backToPassword(ex.message)
      else { setErr(ex); setCode('') } // wrong code — the challenge survives, let them retry
    } finally { setBusy(false) }
  }

  return (
    <div className="login-wrap">
      <div className="login-hero">
        <div className="hero-kicker">Islamic Research Community</div>
        <h1>IRC Admin<br />Dashboard</h1>
        <p className="hero-lede">
          This is the control room for the IRC app. Here the team looks after
          users, checks content, keeps people safe, and watches the system.
        </p>
        <ul className="hero-list">
          <li>Everything you do here is written down. Nothing is secret.</li>
          <li>We never read people&rsquo;s private messages. We only see counts and facts.</li>
          <li>Big actions ask for your password again first. This keeps mistakes away.</li>
        </ul>
      </div>
      <div className="login-form-side">
        {challenge ? (
          <form className="login-card" onSubmit={submitCode}>
            <h2>One more check</h2>
            <p className="login-sub">
              Your password was right. This account also asks for a 6-number code.
            </p>
            <div className="field">
              <span>The 6-number code from your phone app</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                autoComplete="one-time-code"
                inputMode={/^\d*$/.test(code) ? 'numeric' : 'text'}
                placeholder="123456"
              />
            </div>
            <Note>
              No phone with you? Type one of your saved recovery codes in the same box.
              Each recovery code works one time only.
            </Note>
            <Err e={err} />
            <button type="submit" disabled={busy || !code.trim()}>
              {busy ? 'Checking…' : 'Finish signing in'}
            </button>
            <div className="login-foot">
              Time left: {mmss(secondsLeft)} ·{' '}
              <button type="button" className="link" onClick={() => backToPassword()}>
                Start again with my password
              </button>
            </div>
          </form>
        ) : (
          <form className="login-card" onSubmit={submitPassword}>
            <h2>Sign in</h2>
            <p className="login-sub">For the team only — Admin · Moderator · Support · Analyst</p>
            <div className="field">
              <span>Your username or email</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" placeholder="you@example.com" />
            </div>
            <div className="field">
              <span>Your password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
            </div>
            <Err e={err} />
            <button type="submit" disabled={busy || !username || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <div className="login-foot">You can log out one device, or all devices, at any time.</div>
          </form>
        )}
      </div>
    </div>
  )
}
