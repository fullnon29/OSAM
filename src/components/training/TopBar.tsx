"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function TopBar({
  name,
  roleLabel,
}: {
  name: string;
  roleLabel: string;
}) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/training/login");
    router.refresh();
  }

  return (
    <div className="app-topbar">
      <Link className="app-back" href="/">
        ← 홈페이지로 돌아가기
      </Link>
      <div className="who">
        <span className="tag">{roleLabel}</span>
        <span>{name}</span>
        <button className="logout" onClick={handleLogout} type="button">
          로그아웃
        </button>
      </div>
    </div>
  );
}
