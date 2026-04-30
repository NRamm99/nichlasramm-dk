import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type BlogPost = {
  id: number;
  date: string;
  title: string;
  text: string;
  picture: string | null;
};

function Admin() {
  const [posts, setPosts] = useState<BlogPost[]>([]);

  const [editingPostId, setEditingPostId] = useState<number | null>(null);

  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [picture, setPicture] = useState("");

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();

      if (data.session) {
        setIsLoggedIn(true);
        fetchPosts();
      }
    }

    checkSession();
  }, []);

  async function fetchPosts() {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setPosts(data ?? []);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error(error);
      alert("Wrong email or password");
      return;
    }

    setIsLoggedIn(true);
    fetchPosts();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (editingPostId) {
      await updatePost();
    } else {
      await createPost();
    }
  }

  async function createPost() {
    const { error } = await supabase.from("posts").insert([
      {
        date,
        title,
        text,
        picture: picture || null,
      },
    ]);

    if (error) {
      console.error(error);
      alert("Error creating post");
      return;
    }

    clearForm();
    fetchPosts();
  }

  async function updatePost() {
    const { error } = await supabase
      .from("posts")
      .update({
        date,
        title,
        text,
        picture: picture || null,
      })
      .eq("id", editingPostId);

    if (error) {
      console.error(error);
      alert("Error updating post");
      return;
    }

    clearForm();
    fetchPosts();
  }

  async function deletePost(id: number) {
    const confirmed = confirm("Are you sure you want to delete this post?");

    if (!confirmed) return;

    const { error } = await supabase.from("posts").delete().eq("id", id);

    if (error) {
      console.error(error);
      alert("Error deleting post");
      return;
    }

    setPosts((prev) => prev.filter((post) => post.id !== id));
  }

  function startEditing(post: BlogPost) {
    setEditingPostId(post.id);
    setDate(post.date);
    setTitle(post.title);
    setText(post.text);
    setPicture(post.picture ?? "");
  }

  function clearForm() {
    setEditingPostId(null);
    setDate("");
    setTitle("");
    setText("");
    setPicture("");
  }

  if (!isLoggedIn) {
    return (
      <main>
        <h1>Admin login</h1>

        <form
          onSubmit={handleLogin}
          className="flex flex-col gap-4 w-full max-w-xl"
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit">Login</button>
        </form>
      </main>
    );
  }

  return (
    <main>
      <h1>Admin</h1>
      <button type="button" onClick={handleLogout}>
        Logout
      </button>

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

        <div className="flex gap-4">
          <button type="submit">
            {editingPostId ? "Save changes" : "Create post"}
          </button>

          {editingPostId && (
            <button type="button" onClick={clearForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <section className="flex flex-col gap-6 w-full max-w-3xl mt-10">
        {posts.map((post) => (
          <article key={post.id} className="project-card">
            <p>{post.date}</p>
            <h2>{post.title}</h2>
            <p>{post.text}</p>

            {post.picture && <img src={post.picture} alt={post.title} />}

            <div className="flex gap-3 mt-4">
              <button onClick={() => startEditing(post)}>Edit</button>

              <button
                onClick={() => deletePost(post.id)}
                className="bg-red-500"
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

export default Admin;
