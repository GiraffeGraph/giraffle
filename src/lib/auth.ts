import { existsSync, readFileSync } from "node:fs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

function readSecretFromFile(filePath?: string) {
  if (!filePath?.trim()) {
    return null;
  }

  if (!existsSync(filePath)) {
    throw new Error(`Secret file not found: ${filePath}`);
  }

  const value = readFileSync(filePath, "utf8").trim();
  return value.length > 0 ? value : null;
}

const authSecret =
  readSecretFromFile(process.env.AUTH_SECRET_FILE) ??
  readSecretFromFile(process.env.NEXTAUTH_SECRET_FILE) ??
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET;

if (process.env.NODE_ENV === "production" && !authSecret) {
  throw new Error("AUTH_SECRET is required in production");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  secret: authSecret,
  trustHost: true,
  useSecureCookies:
    process.env.NODE_ENV === "production" &&
    process.env.AUTH_DISABLE_SECURE_COOKIES !== "1",
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = String(credentials.email).trim().toLowerCase();
        const password = credentials.password as string;

        const user = await db.user.findUnique({
          where: { email },
        });

        if (!user || !user.password) {
          return null;
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
