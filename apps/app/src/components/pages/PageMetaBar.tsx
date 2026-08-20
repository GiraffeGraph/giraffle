import type{Page}from"@giraffle/domain";import{Pressable,StyleSheet,Text,View}from"react-native";import{Icon,type IconName}from"@/components/ui/primitives";import{useTheme}from"@/design/ThemeProvider";import{radii,spacing,typography}from"@/design/tokens";import{useApp}from"@/state/AppProvider";
const priorityLabels:Record<string,string>={do:"Focus",schedule:"Plan",delegate:"Delegate",eliminate:"Drop"};
/** "2026-08-17T09:30" reads as a machine value; a page shows it the way a person says it. */
const scheduleLabel=(value:string,durationMinutes:number|null):string=>{const[day,time]=value.split("T");const date=new Date(`${day}T12:00:00`);const shown=Number.isNaN(date.getTime())?day:date.toLocaleDateString(undefined,{month:"short",day:"numeric"});return[shown,time?time.slice(0,5):null,durationMinutes?`${durationMinutes}m`:null].filter(Boolean).join(" · ");};
/**
 * Only what the page actually carries earns a row of its own; everything unset
 * folds into one Plan chip so the document starts right under the title.
 */
export function PageMetaBar({page,onOpenPlanning}:{page:Page;onOpenPlanning():void}){const{colors}=useTheme();const{snapshot}=useApp();const state=snapshot.states.find((item)=>item.id===page.stateId);
const items:{key:string;label:string;icon:IconName;accent?:boolean}[]=[];
if(state)items.push({key:"state",label:state.title,icon:state.family==="done"?"checkmark-circle-outline":state.family==="open"?"ellipse-outline":"bookmark-outline",accent:state.family==="open"});
if(page.priority)items.push({key:"priority",label:priorityLabels[page.priority]??page.priority,icon:"flag-outline"});
if(page.scheduledAt)items.push({key:"schedule",label:scheduleLabel(page.scheduledAt,page.durationMinutes),icon:"calendar-outline"});
if(!page.priority||!page.scheduledAt)items.push({key:"plan",label:"Plan",icon:"options-outline"});
return <View style={styles.bar}>{items.map((item)=><Pressable key={item.key} accessibilityRole="button" accessibilityLabel={item.key==="plan"?"Plan this page":`${item.label} — plan this page`} onPress={onOpenPlanning} style={({pressed})=>[styles.chip,{borderColor:colors.border,backgroundColor:item.accent?colors.accentSubtle:pressed?colors.hover:"transparent"}]}><Icon name={item.icon} size={12} color={item.accent?colors.accent:colors.faint}/><Text style={[typography.caption,{color:item.accent?colors.accent:colors.muted}]}>{item.label}</Text></Pressable>)}</View>}
const styles=StyleSheet.create({bar:{flexDirection:"row",flexWrap:"wrap",gap:spacing.xs,marginBottom:spacing.sm},chip:{minHeight:24,paddingHorizontal:spacing.sm,borderWidth:StyleSheet.hairlineWidth,borderRadius:radii.full,flexDirection:"row",alignItems:"center",gap:5}});
