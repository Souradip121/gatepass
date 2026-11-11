// GatePass configuration. This is the only file you edit to host your own copy.
// Supabase → Project Settings → API: copy the Project URL and the anon / public key.
// The anon key is meant to be public; Row Level Security in schema.sql protects the data.
// Never put the service_role key here.
window.GATEPASS = {
  supabaseUrl: "https://nkcmgcunnrqulocdwgxr.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rY21nY3VubnJxdWxvY2R3Z3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxMjc3ODksImV4cCI6MjEwNDcwMzc4OX0.jzOZ7JV1X5mLazg7GBKLhISdK17DaecO8qoooXTAzBc",

  // Show "Continue with Google" on the organiser sign-in.
  // Only turn this on after enabling the Google provider in Supabase → Authentication → Providers.
  googleSignIn: true,
};
