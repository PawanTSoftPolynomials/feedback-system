import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Alert, Field, Loading, RatingInput } from '../components/ui.jsx';
import { CATEGORIES, ROLES, roleLabel } from '../categories.js';
import ThemeToggle from '../components/ThemeToggle.jsx';

const ROLE_HINTS = {
  student: 'I am studying a course and want to share my experience.',
  teacher: 'I teach or train and want to share my experience.',
};

const EMPTY_STUDENT = { fullName: '', mobile: '', email: '', college: '' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateStudent(s) {
  const errors = {};
  if (s.fullName.trim().length < 2) errors.fullName = 'Please enter your full name.';
  const digits = s.mobile.replace(/\D/g, '');
  if (!/^\+?[\d\s()-]+$/.test(s.mobile.trim()) || digits.length < 10 || digits.length > 15) errors.mobile = 'Please enter a valid mobile number (10 to 15 digits).';
  if (!EMAIL_RE.test(s.email.trim())) errors.email = 'Please enter a valid email address.';
  if (s.college.trim().length < 2) errors.college = 'Please enter your college name.';
  return errors;
}

function isEmpty(value) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0) || (typeof value === 'string' && !value.trim());
}

function QuestionInput({ q, value, onChange }) {
  const name = `q-${q.id}`;
  switch (q.type) {
    case 'short_text':
      return <input id={name} className="input" maxLength={500} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'long_text':
      return <textarea id={name} className="input" rows={4} maxLength={5000} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'single_choice':
    case 'yes_no': {
      const options = q.type === 'yes_no' ? [['yes', 'Yes'], ['no', 'No']] : q.options.map((o) => [o, o]);
      return (
        <div className={`choices${q.type === 'yes_no' ? ' inline' : ''}`} role="radiogroup">
          {options.map(([val, label]) => (
            <label key={val} className="choice">
              <input type="radio" name={name} checked={value === val} onChange={() => onChange(val)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      );
    }
    case 'multiple_choice': {
      const picked = Array.isArray(value) ? value : [];
      return (
        <div className="choices">
          {q.options.map((opt) => (
            <label key={opt} className="choice">
              <input
                type="checkbox"
                checked={picked.includes(opt)}
                onChange={(e) => onChange(e.target.checked ? [...picked, opt] : picked.filter((p) => p !== opt))}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}

export default function FeedbackPage() {
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState('role');
  const [role, setRole] = useState(null);
  const [student, setStudent] = useState(EMPTY_STUDENT);
  const [answers, setAnswers] = useState({});
  const [ratings, setRatings] = useState({});
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    api.get('/form')
      .then((data) => {
        setForm(data);
        if (data.title) document.title = data.title;
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  const scrollToFirstError = () => {
    setTimeout(() => document.querySelector('.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };

  const goToForm = (e) => {
    e.preventDefault();
    const errs = validateStudent(student);
    setErrors(errs);
    if (Object.keys(errs).length) return scrollToFirstError();
    setStep('form');
    window.scrollTo(0, 0);
  };

  // Only the questions and ratings the admin created for the chosen role are shown.
  const questions = form && role ? form.questions.filter((q) => q.role === role) : [];
  const attributes = form && role ? form.attributes.filter((a) => a.role === role) : [];

  const chooseRole = (id) => {
    if (id !== role) {
      setAnswers({});
      setRatings({});
    }
    setRole(id);
    setErrors({});
    setStep('details');
    window.scrollTo(0, 0);
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    for (const q of questions) if (q.required && isEmpty(answers[q.id])) errs[`q-${q.id}`] = 'This question is required.';
    for (const a of attributes) if (a.required && !ratings[a.id]) errs[`a-${a.id}`] = 'Please select a rating.';
    setErrors(errs);
    setSubmitError('');
    if (Object.keys(errs).length) return scrollToFirstError();

    setSubmitting(true);
    try {
      const res = await api.post('/submissions', { role, student, answers, ratings, comment });
      setSuccessMessage(res.message);
      setStep('done');
      window.scrollTo(0, 0);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const setStudentField = (key) => (e) => setStudent({ ...student, [key]: e.target.value });

  if (loadError) return <Shell><Alert>{loadError}</Alert></Shell>;
  if (!form) return <Shell><Loading /></Shell>;

  if (!form.open) {
    return (
      <Shell title={form.title}>
        <div className="card center">
          <h2>The feedback form is currently closed</h2>
          <p className="muted">Please check back later.</p>
        </div>
      </Shell>
    );
  }

  if (step === 'done') {
    return (
      <Shell title={form.title}>
        <div className="card center success-card">
          <div className="success-icon" aria-hidden="true">✓</div>
          <h2>Feedback submitted</h2>
          <p>{successMessage}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={form.title} description={form.description}>
      <ol className="steps" aria-label="Progress">
        <li className={step === 'role' ? 'current' : 'done'}>1. I am a…</li>
        <li className={step === 'details' ? 'current' : step === 'form' ? 'done' : ''}>2. Your details</li>
        <li className={step === 'form' ? 'current' : ''}>3. Feedback</li>
      </ol>

      {step === 'role' && (
        <section className="card">
          <h2>Who is giving feedback?</h2>
          <p className="muted">Choose your role to see the questions meant for you.</p>
          <div className="role-grid">
            {ROLES.map((r) => (
              <button key={r.id} type="button" className={`role-card${role === r.id ? ' selected' : ''}`} onClick={() => chooseRole(r.id)}>
                <span className="role-icon" aria-hidden="true">{r.id === 'teacher' ? '🧑‍🏫' : '🎓'}</span>
                <span className="role-name">I am a {r.label}</span>
                <span className="role-hint">{ROLE_HINTS[r.id]}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 'details' && (
        <form className="card" onSubmit={goToForm} noValidate>
          <div className="page-head">
            <h2>Your details</h2>
            <span className="muted small">Giving feedback as a <strong>{roleLabel(role)}</strong> · <button type="button" className="link-btn" onClick={() => setStep('role')}>Change</button></span>
          </div>
          <Field label="Full name" required error={errors.fullName} htmlFor="fullName">
            <input id="fullName" className="input" autoComplete="name" maxLength={100} value={student.fullName} onChange={setStudentField('fullName')} />
          </Field>
          <Field label="Mobile number" required error={errors.mobile} htmlFor="mobile">
            <input id="mobile" className="input" type="tel" autoComplete="tel" maxLength={20} value={student.mobile} onChange={setStudentField('mobile')} />
          </Field>
          <Field label="Email address" required error={errors.email} htmlFor="email">
            <input id="email" className="input" type="email" autoComplete="email" maxLength={254} value={student.email} onChange={setStudentField('email')} />
          </Field>
          <Field label={role === 'teacher' ? 'College / institution name' : 'College name'} required error={errors.college} htmlFor="college">
            <input id="college" className="input" maxLength={150} value={student.college} onChange={setStudentField('college')} />
          </Field>
          <div className="actions space-between">
            <button type="button" className="btn btn-secondary" onClick={() => setStep('role')}>Back</button>
            <button className="btn btn-primary" type="submit">Continue</button>
          </div>
        </form>
      )}

      {step === 'form' && (
        <form onSubmit={submit} noValidate>
          {CATEGORIES.map((c) => {
            const sectionQuestions = questions.filter((q) => q.category === c.id);
            const sectionAttributes = attributes.filter((a) => a.category === c.id);
            if (!sectionQuestions.length && !sectionAttributes.length) return null;
            return (
              <section className="card" key={c.id}>
                <h2>{c.label} feedback</h2>
                {sectionQuestions.map((q, i) => (
                  <Field key={q.id} label={`${i + 1}. ${q.text}`} required={q.required} error={errors[`q-${q.id}`]} htmlFor={`q-${q.id}`}>
                    <QuestionInput q={q} value={answers[q.id]} onChange={(v) => setAnswers({ ...answers, [q.id]: v })} />
                  </Field>
                ))}
                {sectionAttributes.length > 0 && (
                  <div className="rating-group">
                    <h3>Rate the {c.label}</h3>
                    <p className="muted small">1 is the lowest rating; the highest number is the best.</p>
                    {sectionAttributes.map((a) => (
                      <Field key={a.id} label={`${a.name} (1–${a.scale})`} required={a.required} hint={a.description} error={errors[`a-${a.id}`]}>
                        <RatingInput scale={a.scale} value={ratings[a.id] || null} onChange={(v) => setRatings({ ...ratings, [a.id]: v })} />
                      </Field>
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          <section className="card card-highlight">
            <h2>Your own feedback</h2>
            <Field label="Share your feedback, suggestions or complaints" htmlFor="comment" hint="Anything else you want us to know. This is optional.">
              <textarea id="comment" className="input" rows={6} maxLength={5000} value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>
            <p className="muted small right">{comment.length}/5000</p>
          </section>

          <Alert>{submitError}</Alert>
          <div className="actions space-between">
            <button type="button" className="btn btn-secondary" onClick={() => { setStep('details'); setSubmitError(''); }}>Back</button>
            <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit feedback'}</button>
          </div>
        </form>
      )}
    </Shell>
  );
}

function Shell({ title, description, children }) {
  return (
    <div className="public-page">
      <header className="public-header">
        <div className="container">
          <div className="public-header-row">
            <h1>{title || 'Feedback'}</h1>
            <ThemeToggle />
          </div>
          {description && <p className="lead">{description}</p>}
        </div>
      </header>
      <main className="container narrow">{children}</main>
    </div>
  );
}
