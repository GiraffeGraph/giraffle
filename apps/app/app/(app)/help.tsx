import { StyleSheet,Text,View } from "react-native";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { Icon,type IconName } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { spacing,typography } from "@/design/tokens";
const items:[IconName,string,string][]=[
  ["document-text-outline","Pages","Everything is a page. Pages can contain direct child pages and move to one real parent."],
  ["options-outline","States and categories","Custom states describe meaning; each page owns optional categories for its direct children."],
  ["compass-outline","Plan","List, calendar and priority are reusable views over the same pages."],
  ["map-outline","Canvas","Arrange canonical page references without making copies."],
];
export default function Help(){const{colors}=useTheme();return <><ScreenTopbar title="Help"/><Page><View style={{gap:spacing.xl}}>{items.map(([icon,title,body])=><View key={title} style={styles.row}><Icon name={icon} color={colors.accent}/><View style={{flex:1,gap:3}}><Text style={[typography.title,{color:colors.text}]}>{title}</Text><Text style={[typography.body,{color:colors.secondary}]}>{body}</Text></View></View>)}</View></Page></>;}
const styles=StyleSheet.create({row:{flexDirection:"row",alignItems:"flex-start",gap:spacing.md}});
