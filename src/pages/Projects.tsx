import ProjectCard from "../components/ProjectCard";

function Projects() {
  return (
    <main className="projects-page">
      {/* Override index.css h1 to make it yellow*/}
      <h1 className="text-red-500">Projects</h1>

      <div className="projects-grid">
        <ProjectCard
          title="100 Days"
          description="Mit projekt hvor jeg koder hver dag i 100 dage."
        />

        <ProjectCard
          title="Broccoli Ben"
          description="Brotato-inspired co-op game med upgrades og waves."
        />

        <ProjectCard
          title="Racekatteklubben"
          description="Spring Boot system med clean architecture og MySQL."
        />
      </div>
    </main>
  );
}

export default Projects;
