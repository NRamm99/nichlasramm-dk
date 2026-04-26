type ProjectCardProps = {
    title: string;
    description: string;
  };
  
  function ProjectCard({ title, description }: ProjectCardProps) {
    return (
      <div className="project-card">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    );
  }
  
  export default ProjectCard;