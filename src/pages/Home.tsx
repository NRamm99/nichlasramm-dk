import GitHubHeatMap from "../components/GitHubHeatMap";
import mig from "../assets/mig.jpg";
import { Link } from "react-router-dom";
import SocialLinks from "../components/SocialLinks";

function Home() {
  return (
    <main>
      <div className="flex flex-row items-center justify-center gap-10">
        <img
          src={mig}
          alt="Nichlas Ramm"
          className="size-100 rounded-full fill-white drop-shadow-xl/75"
        />

        <div className="flex flex-col gap-4">
          <h1>Nichlas Ramm</h1>
          <p>Fulltime student @Zealand · Web dev · game dev</p>

          <div className="flex flex-row gap-4 justify-center">
            <Link to="/projects">
              <button className="transition duration-150 ease-in-out hover:scale-105 w-50">
                Se projekter
              </button>
            </Link>

            <Link to="/blog">
              <button className="transition duration-150 ease-in-out hover:scale-105 w-50">
                Læs blog
              </button>
            </Link>
          </div>
          <div className="flex flex-row justify-center mt-4">
            <SocialLinks />
          </div>
        </div>
      </div>

      <GitHubHeatMap />
    </main>
  );
}

export default Home;
