import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Form } from '@openedx/paragon';

// Isolated email input — manages local state so typing never triggers a parent
// re-render. Commits to orgRosters (and starts verification) 1 s after the user
// stops typing, or immediately on blur so tabbing away also works.
const TeamEmailCell = ({
  value: externalValue, orgCode, rowIndex, apiStatus, onUpdate,
}) => {
  const [localValue, setLocalValue] = useState(externalValue);
  const timerRef = useRef(null);

  useEffect(() => { setLocalValue(externalValue); }, [externalValue]);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleChange = e => {
    const v = e.target.value;
    setLocalValue(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onUpdate(orgCode, rowIndex, 'email', v), 1000);
  };

  const handleBlur = () => {
    clearTimeout(timerRef.current);
    onUpdate(orgCode, rowIndex, 'email', localValue);
  };

  const trimmed = localValue.trim();
  const isInvalid = apiStatus === 'not_found' || (!trimmed.includes('@') && trimmed.length > 0);

  return (
    <Form.Control
      size="sm"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder="instructor@example.org"
      className="sc-email-input"
      isInvalid={isInvalid}
    />
  );
};

TeamEmailCell.propTypes = {
  value: PropTypes.string.isRequired,
  orgCode: PropTypes.string.isRequired,
  rowIndex: PropTypes.number.isRequired,
  apiStatus: PropTypes.string,
  onUpdate: PropTypes.func.isRequired,
};
TeamEmailCell.defaultProps = { apiStatus: undefined };

export default TeamEmailCell;
