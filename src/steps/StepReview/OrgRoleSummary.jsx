// Team & Access pill strip rendered in the StepReview per-org accordion.
// Must be defined OUTSIDE StepReview — never inline or as an IIFE.
// Returns null when no email addresses have been filled in for the org.

const BORDER = '#dee2e6';
const G500 = '#6c757d';
const G900 = '#1f2937';
const BRAND = '#006daa';
const BRAND_LT = '#deeef8';
const INFO_BG = '#e8f7fc';
const INFO = '#055160';

export default function OrgRoleSummary({ orgCode, orgRosters }) {
  const members = (orgRosters[orgCode] || []).filter(m => m.email);
  if (!members.length) return null;

  const pluralS = members.length !== 1 ? 's' : '';

  return (
    <div style={{ padding: '10px 16px', borderTop: '1px solid ' + BORDER, background: '#f9fafb' }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: G500,
        textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8,
      }}>
        {'Team & Access - ' + members.length + ' member' + pluralS}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {members.map((m, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', background: '#fff',
            border: '1px solid ' + BORDER, borderRadius: 4, fontSize: 12,
          }}>
            <span style={{ color: G900, fontWeight: 500 }}>{m.email}</span>
            <span style={{
              display: 'inline-block', padding: '2px 7px', borderRadius: 12,
              fontSize: 10, fontWeight: 600, lineHeight: 1.5,
              background: BRAND_LT, color: BRAND,
            }}>{m.studio}</span>
            {m.discussion !== 'none' && (
              <span style={{
                display: 'inline-block', padding: '2px 7px', borderRadius: 12,
                fontSize: 10, fontWeight: 600, lineHeight: 1.5,
                background: INFO_BG, color: INFO,
              }}>{m.discussion}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
