import { groupByCategory } from '../categories.js';

function formatAnswer(a) {
  if (Array.isArray(a.answer)) return a.answer.length ? a.answer.join(', ') : '—';
  if (a.type === 'yes_no') return a.answer === 'yes' ? 'Yes' : a.answer === 'no' ? 'No' : '—';
  return a.answer || '—';
}

// Submissions made before sections existed have no category; they belong to the LMS section.
const categoryOf = (item) => item.category || 'lms';

/** Answers and ratings of one feedback submission, grouped by section, plus the personal comment. */
export default function FeedbackContent({ answers = [], ratings = [], comment = '' }) {
  const answerGroups = groupByCategory(answers, categoryOf);
  const ratingGroups = groupByCategory(ratings, categoryOf);
  const sections = [...new Set([...answerGroups, ...ratingGroups].map((g) => g.id))].map((id) => ({
    id,
    label: (answerGroups.find((g) => g.id === id) || ratingGroups.find((g) => g.id === id)).label,
    answers: answerGroups.find((g) => g.id === id)?.items || [],
    ratings: ratingGroups.find((g) => g.id === id)?.items || [],
  }));

  return (
    <>
      {sections.length === 0 && <section className="card"><p className="muted">No answers or ratings.</p></section>}
      {sections.map((s) => (
        <section className="card" key={s.id}>
          <h2>{s.label} feedback</h2>
          {s.answers.length > 0 && (
            <dl className="answers">
              {s.answers.map((a) => (
                <div key={a.questionId}>
                  <dt>{a.question}</dt>
                  <dd className="pre-wrap">{formatAnswer(a)}</dd>
                </div>
              ))}
            </dl>
          )}
          {s.ratings.length > 0 && (
            <div className="rating-group">
              <h3>{s.label} ratings</h3>
              <table className="table">
                <tbody>
                  {s.ratings.map((r) => (
                    <tr key={r.attributeId}><td>{r.name}</td><td className="right"><strong>{r.value ?? '—'}</strong> / {r.scale}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      <section className="card card-highlight">
        <h2>Personal feedback, suggestions or complaints</h2>
        {comment ? <p className="pre-wrap">{comment}</p> : <p className="muted">No personal comment.</p>}
      </section>
    </>
  );
}
