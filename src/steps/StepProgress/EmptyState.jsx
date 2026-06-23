import PropTypes from 'prop-types';
import { Button } from '@openedx/paragon';

const EmptyState = ({ onGoWizard }) => (
  <div className="sp-empty">
    <div className="sp-empty-icon">📊</div>
    <div className="sp-empty-title">No active runs</div>
    <div className="sp-empty-sub">
      Start a bulk run from the wizard. Progress will appear here in real time.
    </div>
    <Button variant="primary" onClick={onGoWizard}>Go to Bulk Run Wizard</Button>
  </div>
);

EmptyState.propTypes = {
  onGoWizard: PropTypes.func.isRequired,
};

export default EmptyState;
