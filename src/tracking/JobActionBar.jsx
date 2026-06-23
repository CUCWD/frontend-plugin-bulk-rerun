import PropTypes from 'prop-types';
import { Button } from '@openedx/paragon';

const JobActionBar = ({
  isDryRun, isNewOrg, allComplete, onExecute, onNew,
}) => (
  <div className="jp-action-bar">
    {isDryRun && allComplete && (
      <Button variant={isNewOrg ? 'brand' : 'primary'} onClick={onExecute}>
        {isNewOrg ? 'Onboard organizations' : 'Execute reruns'}
      </Button>
    )}
    <Button variant="outline-primary" onClick={onNew}>+ New job</Button>
  </div>
);

JobActionBar.propTypes = {
  isDryRun: PropTypes.bool.isRequired,
  isNewOrg: PropTypes.bool.isRequired,
  allComplete: PropTypes.bool.isRequired,
  onExecute: PropTypes.func,
  onNew: PropTypes.func.isRequired,
};

JobActionBar.defaultProps = {
  onExecute: null,
};

export default JobActionBar;
