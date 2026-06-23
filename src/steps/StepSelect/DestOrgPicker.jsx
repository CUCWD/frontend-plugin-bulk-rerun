import PropTypes from 'prop-types';
import { Button, Spinner } from '@openedx/paragon';
import './DestOrgPicker.scss';

const DestOrgPicker = ({
  orgs, selectedCodes, onToggle, onSelectAll, onClearAll, isLoading, isError,
}) => {
  const selectedCount = selectedCodes.size;

  return (
    <div className="ss-dest">
      <div className="ss-dest-header">
        <div>
          <div className="ss-dest-title">Destination organizations</div>
          <div className="ss-dest-sub">Each selected course will be rerun for every checked organization.</div>
        </div>
        <div className="ss-dest-btns">
          <Button variant="outline-primary" size="sm" onClick={onSelectAll}>All</Button>
          {selectedCount > 0 && (
            <Button variant="tertiary" size="sm" onClick={onClearAll} className="ss-clear-btn">Clear</Button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="ss-loading ss-loading--sm">
          <Spinner animation="border" size="sm" className="me-2" />
          Loading organizations…
        </div>
      )}
      {isError && (
        <div className="ss-error ss-error--sm">
          Failed to load organizations. Please refresh and try again.
        </div>
      )}
      {!isLoading && !isError && (
        <div className="ss-org-grid">
          {orgs.map(o => {
            const on = selectedCodes.has(o.code);
            return (
              <div
                key={o.code}
                role="checkbox"
                tabIndex={0}
                aria-checked={on}
                onClick={() => onToggle(o.code)}
                onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { onToggle(o.code); } }}
                className={`ss-org-item${on ? ' ss-org-item--selected' : ''}`}
              >
                <input type="checkbox" checked={on} readOnly tabIndex={-1} />
                <div className="ss-org-inner">
                  <div className="ss-org-item-name">{o.name}</div>
                  <div className="ss-org-item-code">{o.code}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

DestOrgPicker.propTypes = {
  orgs: PropTypes.arrayOf(PropTypes.shape({
    code: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
  })).isRequired,
  selectedCodes: PropTypes.instanceOf(Set).isRequired,
  onToggle: PropTypes.func.isRequired,
  onSelectAll: PropTypes.func.isRequired,
  onClearAll: PropTypes.func.isRequired,
  isLoading: PropTypes.bool.isRequired,
  isError: PropTypes.bool.isRequired,
};

export default DestOrgPicker;
