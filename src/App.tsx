import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/NavBar";

import Home from "./pages/Home";
import Projects from "./pages/Projects";
import Blog from "./pages/Blog";
import About from "./pages/About";
import Admin from "./pages/Admin";

import "./App.css";

function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/about" element={<About />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/Admin" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<main><h1>404</h1><p>Page not found</p></main>} />
      </Routes>
    </>
  );
}

export default App;
