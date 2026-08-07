import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/training/TopBar";
import PostsAdminBoard from "@/components/training/PostsAdminBoard";
import type { Post } from "@/lib/posts";

export default async function PostsAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/training/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/training/login");
  if (profile.role !== "admin") redirect("/training");

  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <>
      <TopBar name="시설장 (관리자)" roleLabel="관리자" />
      <PostsAdminBoard posts={(posts ?? []) as Post[]} />
    </>
  );
}
