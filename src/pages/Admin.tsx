import { useState } from "react";
import { supabase } from "../lib/supabase";

type BlogPost = {
  date: string;
  title: string;
  text: string;
  picture: string;
};

function Admin() {
  const [posts, setPosts] = useState<BlogPost[]>([]);

  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [picture, setPicture] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const { error } = await supabase.from("posts").insert([
      {
        date,
        title,
        text,
        picture,
      },
    ]);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    alert("Post created!");

    setDate("");
    setTitle("");
    setText("");
    setPicture("");
  }

  return (
    <main>
      <h1>Admin</h1>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 w-full max-w-xl"
      >
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          placeholder="Text"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <input
          type="text"
          placeholder="Picture URL"
          value={picture}
          onChange={(e) => setPicture(e.target.value)}
        />

        <button type="submit">Create post</button>
      </form>

      <section className="flex flex-col gap-4 mt-8 w-full max-w-xl">
        {posts.map((post) => (
          <article className="project-card" key={`${post.date}-${post.title}`}>
            <p>{post.date}</p>
            <h2>{post.title}</h2>
            <p>{post.text}</p>

            {post.picture && <img src={post.picture} alt={post.title} />}
          </article>
        ))}
      </section>
    </main>
  );
}

export default Admin;
