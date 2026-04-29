function Admin() {
  return (
    <main>
      <h1>Admin</h1>

      <form className="flex flex-col gap-4 w-full max-w-xl">
        <input type="date" />
        <input type="text" placeholder="Title" />
        <textarea placeholder="Text" rows={8}></textarea>
        <input type="text" placeholder="Picture URL" />

        <button type="submit">Create post</button>
      </form>
    </main>
  );
}

export default Admin;
