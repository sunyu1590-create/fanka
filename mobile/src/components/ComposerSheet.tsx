import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../lib/theme";

export function ComposerSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { colors } = useTheme(); const insets = useSafeAreaInsets();
  const [reduced,setReduced] = useState(false);
  useEffect(()=>{let active=true;void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active)setReduced(value);});const listener=AccessibilityInfo.addEventListener("reduceMotionChanged",setReduced);return()=>{active=false;listener.remove();};},[]);
  return <Modal transparent animationType={reduced ? "none" : "fade"} visible onRequestClose={onClose}><View style={{flex:1,justifyContent:"flex-end",backgroundColor:"#0008"}}><Pressable accessibilityLabel="返回编辑" onPress={onClose} style={{flex:1}}/><View accessibilityViewIsModal style={{maxHeight:"85%",backgroundColor:colors.bg,borderTopLeftRadius:12,borderTopRightRadius:12,paddingBottom:insets.bottom}}><View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20,minHeight:54,borderBottomWidth:1,borderColor:colors.line}}><Text style={{color:colors.ink,fontSize:15,fontWeight:"600"}}>{title}</Text><Pressable onPress={onClose} style={{minWidth:44,minHeight:44,justifyContent:"center"}}><Text style={{color:colors.action,textAlign:"right"}}>完成</Text></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:24}}>{children}</ScrollView></View></View></Modal>;
}
