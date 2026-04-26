import { Routes, Route } from "react-router-dom";
import Navbar from "./components/NavBar";

import Home from "./pages/Home";
import Projects from "./pages/Projects";
import Blog from "./pages/Blog";
import About from "./pages/About";

import "./App.css";
import GitHubHeatmap from "./components/GitHubHeatMap";

function App() {
  return (
    <>
      <Navbar />

      <GitHubHeatmap />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </>
  );
}

export default App;
