import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type BlogPost = {
  id: number;
  date: string;
  title: string;
  text: string;
  picture: string | null;
};

function Blog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
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

    fetchPosts();
  }, []);

  return (
    <main>
      <h1>Blog</h1>

      <section className="flex flex-col gap-6 w-full max-w-3xl">
        {posts.map((post) => (
          <article key={post.id} className="project-card">
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

export default Blog;
