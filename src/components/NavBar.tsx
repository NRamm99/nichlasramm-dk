import { NavLink } from "react-router-dom";

function Navbar() {
  return (
    <nav className="navbar">
      <NavLink to="/" className="logo">
        NichlasRamm.dk
      </NavLink>

      <div className="flex gap-4">
        <NavLink to="/" className="hover:text-blue-500">
          Home
        </NavLink>
        <NavLink to="/projects" className="hover:text-blue-500">
          Projects
        </NavLink>
        <NavLink to="/blog" className="hover:text-blue-500">
          Blog
        </NavLink>
        <NavLink to="/about" className="hover:text-blue-500">
          About
        </NavLink>
      </div>
    </nav>
  );
}

export default Navbar;
