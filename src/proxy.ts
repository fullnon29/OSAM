import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isTrainingPath = request.nextUrl.pathname.startsWith("/training");
  const isLoginPath = request.nextUrl.pathname === "/training/login";

  if (isTrainingPath && !isLoginPath && !user) {
    const loginUrl = new URL("/training/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoginPath && user) {
    return NextResponse.redirect(new URL("/training", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/training/:path*"],
};
