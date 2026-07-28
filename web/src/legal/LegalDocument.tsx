import { PRIVACY_POLICY, TERMS_OF_SERVICE } from './content';

type Doc = typeof PRIVACY_POLICY | typeof TERMS_OF_SERVICE;

export function LegalDocument({ kind }: { kind: 'privacy' | 'terms' }) {
  const doc: Doc = kind === 'privacy' ? PRIVACY_POLICY : TERMS_OF_SERVICE;
  return (
    <article className="legal-doc">
      <header className="legal-doc-head">
        <h2>{doc.title}</h2>
        <p>최종 업데이트 · {doc.updatedAt}</p>
      </header>
      {doc.sections.map((section) => (
        <section key={section.heading} className="legal-section">
          <h3>{section.heading}</h3>
          {section.body.map((paragraph, i) => (
            <p key={`${section.heading}-${i}`}>{paragraph}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
