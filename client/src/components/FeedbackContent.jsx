function formatAnswer(a) {
  if (Array.isArray(a.answer)) return a.answer.length ? a.answer.join(', ') : '—';
  if (a.type === 'yes_no') return a.answer === 'yes' ? 'Yes' : a.answer === 'no' ? 'No' : '—';
  return a.answer || '—';
}

/** Answers, ratings and personal comment of one feedback submission. */
export default function FeedbackContent({ answers = [], ratings = [], comment = '' }) {
  return (
    <>
      <section className="card">
        <h2>Answers</h2>
        {answers.length === 0 ? <p className="muted">No questions were answered.</p> : (
          <dl className="answers">
            {answers.map((a) => (
              <div key={a.questionId}>
                <dt>{a.question}</dt>
                <dd className="pre-wrap">{formatAnswer(a)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="card">
        <h2>Ratings</h2>
        {ratings.length === 0 ? <p className="muted">No ratings.</p> : (
          <table className="table">
            <tbody>
              {ratings.map((r) => (
                <tr key={r.attributeId}><td>{r.name}</td><td className="right"><strong>{r.value ?? '—'}</strong> / {r.scale}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card card-highlight">
        <h2>Personal feedback, suggestions or complaints</h2>
        {comment ? <p className="pre-wrap">{comment}</p> : <p className="muted">No personal comment.</p>}
      </section>
    </>
  );
}
