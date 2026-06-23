// Team & Access pill strip rendered in the StepReview per-org accordion.
// Must be defined OUTSIDE StepReview — never inline or as an IIFE.
// Returns null when no email addresses have been filled in for the org.
import PropTypes from 'prop-types';

const OrgRoleSummary = ({ orgCode, orgRosters }) => {
  const members = (orgRosters[orgCode] || []).filter(m => m.email);
  if (!members.length) { return null; }

  const pluralS = members.length !== 1 ? 's' : '';

  return (
    <div className="sr-team-strip">
      <div className="sr-team-label">
        {`Team & Access - ${ members.length } member${ pluralS}`}
      </div>
      <div className="sr-member-pills">
        {members.map(m => (
          <div key={m.email} className="sr-member-pill">
            <span className="sr-member-email">{m.email}</span>
            <span className="sr-role-badge sr-role-badge--studio">{m.studio}</span>
            {m.discussion !== 'none' && (
              <span className="sr-role-badge sr-role-badge--disc">{m.discussion}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

OrgRoleSummary.propTypes = {
  orgCode: PropTypes.string.isRequired,
  orgRosters: PropTypes.objectOf(PropTypes.arrayOf(PropTypes.shape({
    email: PropTypes.string,
    studio: PropTypes.string,
    discussion: PropTypes.string,
  }))).isRequired,
};

export default OrgRoleSummary;
