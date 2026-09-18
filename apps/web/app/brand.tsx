import { NavLink } from "react-router";

export function Brand() {
  return (
    <NavLink className="brand" to="/">
      <i className="brandMark" aria-hidden="true" />
      <span>
        <b>OpenCards</b>
        <small>掼蛋</small>
      </span>
    </NavLink>
  );
}
