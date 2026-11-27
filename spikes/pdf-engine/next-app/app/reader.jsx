"use client";
import dynamic from "next/dynamic";
const Viewer = dynamic(() => import("./viewer"), { ssr: false });
export default function Reader() { return <div style={{ height: "100vh" }}><Viewer /></div>; }
