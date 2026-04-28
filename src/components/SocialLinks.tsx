function SocialLinks() {
  return (
    <div className="flex gap-4 mt-4">
      {/* GitHub */}
      <a
        href="https://github.com/NRamm99"
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg
          className="w-6 h-6 text-white transition duration-200 ease-in-out hover:text-sky-400 hover:scale-110"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.38.6.1.82-.26.82-.58
0-.28-.01-1.02-.02-2-3.34.72-4.04-1.61-4.04-1.61-.55-1.38-1.34-1.75-1.34-1.75
-1.09-.75.08-.74.08-.74 1.2.08 1.83 1.23 1.83 1.23 1.07 1.83 2.8 1.3
3.49.99.11-.77.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.93
0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.17 0 0 1-.32
3.3 1.23.96-.27 2-.4 3.03-.4s2.07.13 3.03.4c2.3-1.55
3.3-1.23 3.3-1.23.65 1.65.24 2.87.12 3.17.77.84
1.23 1.91 1.23 3.22 0 4.6-2.8 5.63-5.48 5.93.43.37.82 1.1.82
2.22 0 1.6-.02 2.9-.02 3.3 0 .32.22.69.82.57C20.56
21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"
          />{" "}
        </svg>
      </a>

      {/* LinkedIn */}
      <a
        href="http://www.linkedin.com/in/nichlasramm"
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg
          className="w-6 h-6 text-white transition duration-200 ease-in-out hover:text-sky-400 hover:scale-110"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            d="M20.45 20.45h-3.6v-5.6c0-1.33-.03-3.04-1.85-3.04-1.85
0-2.14 1.45-2.14 2.95v5.69H9.27V9h3.46v1.56h.05c.48-.9
1.65-1.85 3.4-1.85 3.63 0 4.3 2.39 4.3 5.49v6.25zM5.34
7.43c-1.16 0-2.1-.94-2.1-2.1s.94-2.1 2.1-2.1 2.1.94
2.1 2.1-.94 2.1-2.1 2.1zM7.12 20.45H3.56V9h3.56v11.45zM22.23
0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24
1.77 24h20.46c.98 0 1.77-.77
1.77-1.72V1.72C24 .77 23.21 0 22.23 0z"
          />{" "}
        </svg>
      </a>
    </div>
  );
}

export default SocialLinks;
