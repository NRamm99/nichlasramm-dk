import GitHubHeatMap from "../components/GitHubHeatMap";

function Home() {
  return (
    <main>
      <h1>Nichlas Ramm</h1>
      <p>Datamatiker-studerende · Indie dev · Web dev learner</p>

      <button>Se projekter</button>
      <button>Læs blog</button>
      <GitHubHeatMap />
    </main>
  );
}

export default Home;
