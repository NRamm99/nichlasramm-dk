import ProjectCard from "../components/ProjectCard";

function Projects() {
  return (
    <main className="projects-page">
      {/* Override index.css h1 to make it yellow*/}
      <h1>Projects</h1>

      <h2>Ongoing Projects</h2>
      <div className="projects-grid">
        <ProjectCard
          title="100 Days"
          description="To work on my discipline and coding skills, I set my self the challenge to code for 100 days straight."
        />

        <ProjectCard
          title="NichlasRamm.dk"
          description="This website is an ongoing project to learn more about web development and to showcase my projects."
        />
      </div>

      <h2>Completed Projects</h2>
      <div className="projects-grid">
        <ProjectCard
          title="A lot of small school projects"
          description="A lot of small school projects that I have worked on since I started studying @Zealand."
        />

        <ProjectCard
          title="Racekatteklubben"
          description="School project where I worked on a Spring Boot system with clean architecture and MySQL."
        />
      </div>
    </main>
  );
}

export default Projects;
