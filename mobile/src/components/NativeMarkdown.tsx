import React, { memo } from "react";
import { Linking, Text, View } from "react-native";
import { useTheme } from "../lib/theme";

/** Shared native article/preview renderer; no network or editor state. */
export const NativeMarkdown = memo(function NativeMarkdown({ source }: { source: string }) {
  const { colors } = useTheme();
  const inline = (text:string) => text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).map((part,index)=>{
    if(part.startsWith("**")&&part.endsWith("**")) return <Text key={index} style={{fontWeight:"700"}}>{part.slice(2,-2)}</Text>;
    if(part.startsWith("`")&&part.endsWith("`")) return <Text key={index} style={{fontFamily:"monospace",backgroundColor:colors.surface}}>{part.slice(1,-1)}</Text>;
    const link=part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    return link ? <Text key={index} accessibilityRole="link" style={{color:colors.action}} onPress={()=>void Linking.openURL(link[2]).catch(()=>{})}>{link[1]}</Text> : part;
  });
  let fenced=false;
  return <View style={{gap:9}}>{source.split("\n").map((line,index)=>{
    if(line.startsWith("```")){fenced=!fenced;return null;}
    const heading=line.match(/^(#{1,6})\s+(.+)/),quote=line.startsWith("> ");
    const value=heading?heading[2]:quote?line.slice(2):line.replace(/^[-*]\s+/,"• ");
    return <Text selectable key={index} style={{color:quote?colors.muted:colors.ink,fontSize:heading?Math.max(17,25-heading[1].length*2):15,lineHeight:heading?30:25,fontWeight:heading?"600":"400",fontFamily:fenced?"monospace":undefined,backgroundColor:fenced?colors.surface:"transparent",paddingLeft:quote?10:0,borderLeftWidth:quote?2:0,borderColor:colors.line}}>{fenced?line:inline(value)||" "}</Text>;
  })}</View>;
});
