"use client";

import { CalendarDays, CheckCircle2, ClipboardList, HeartPulse, LayoutDashboard, LogOut, Mail, Menu, NotebookPen, Plus, Search, Send, Sparkles, Store, Trash2, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Section = "Dashboard" | "Clientes" | "Pendientes" | "Calendario" | "Marcas" | "Notas" | "Salud" | "Email";
type Client = { id:string; name:string; brand:string|null; primary_contact:string|null; service:string|null; status:string; priority:string; next_step:string|null };
type Task = { id:string; client_id:string|null; area:string|null; title:string; priority:string; status:string; due_date:string|null };
type Brand = { id:string; name:string; type:string|null; objective:string|null };
type Note = { id:string; category:string|null; body:string; related_to:string|null; priority:string|null };
type EventItem = { id:string; title:string; description:string|null; starts_at:string; location:string|null; status:string };
type Health = { id:string; entry_date:string; sleep_hours:number|null; energy_level:number|null; water_glasses:number|null; movement_minutes:number|null; mood:string|null; notes:string|null };
type EmailSummary = { id:string; thread_id:string; from:string; to:string; subject:string; date:string; snippet:string };
type EmailDetail = EmailSummary & { body:string; truncated:boolean };

const nav = [["Dashboard",LayoutDashboard],["Clientes",Users],["Pendientes",ClipboardList],["Calendario",CalendarDays],["Marcas",Store],["Notas",NotebookPen],["Salud",HeartPulse],["Email",Mail]] as const;
const starterClients = [
  { name:"Salami Sibao", brand:"Amazing Solutions", primary_contact:"Orian", service:"Website + publicidad mensual", status:"Activo", priority:"Alta", next_step:"Terminar actualización web y seguimiento en Toronto." },
  { name:"MiKiosko.ca", brand:"Amazing Solutions / TorontoDominicano", primary_contact:"Por confirmar", service:"Contenido + publicidad mensual", status:"Activo", priority:"Alta", next_step:"Crear contenido con productos reales y colocar banners." },
];
const starterTasks = [
  { title:"Terminar actualización web", area:"Salami Sibao", priority:"Alta", status:"Pendiente" },
  { title:"Dar seguimiento a representante de Toronto", area:"Salami Sibao", priority:"Alta", status:"Pendiente" },
  { title:"Crear contenido con productos reales", area:"MiKiosko.ca", priority:"Alta", status:"En progreso" },
  { title:"Colocar banners en TorontoDominicano", area:"MiKiosko.ca", priority:"Media", status:"Pendiente" },
];
const starterBrands = [
  { name:"Amazing Solutions", type:"Negocio principal", objective:"Web, marketing y ventas" },
  { name:"TorontoDominicano", type:"Medio comunitario", objective:"Eventos y comunidad dominicana" },
  { name:"Samy Prez", type:"Marca personal", objective:"Contenido y liderazgo" },
];

export default function SamyOSApp(){
  const [section,setSection]=useState<Section>("Dashboard");
  const [menu,setMenu]=useState(false); const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState(""); const [search,setSearch]=useState("");
  const [clients,setClients]=useState<Client[]>([]); const [tasks,setTasks]=useState<Task[]>([]);
  const [brands,setBrands]=useState<Brand[]>([]); const [notes,setNotes]=useState<Note[]>([]);
  const [events,setEvents]=useState<EventItem[]>([]); const [health,setHealth]=useState<Health[]>([]);
  const [assistant,setAssistant]=useState(""); const [reply,setReply]=useState("");

  useEffect(()=>{
    void loadAll();
    const refresh=()=>{ void loadAll(); };
    window.addEventListener("samy-os-data-changed", refresh);
    return ()=>window.removeEventListener("samy-os-data-changed", refresh);
  },[]);

  async function userId(){
    const {data,error}=await supabase.auth.getUser();
    if(error){ setNotice("No pude verificar tu sesión. Vuelve a iniciar sesión."); return null; }
    return data.user?.id ?? null;
  }

  async function loadAll(){
    setLoading(true); setNotice("");
    const uid=await userId();
    if(!uid){ window.location.href="/login"; return; }
    const [c,t,b,n,e,h]=await Promise.all([
      supabase.from("clients").select("*").eq("user_id",uid).order("created_at"),
      supabase.from("tasks").select("*").eq("user_id",uid).order("created_at"),
      supabase.from("brands").select("*").eq("user_id",uid).order("created_at"),
      supabase.from("notes").select("*").eq("user_id",uid).order("created_at",{ascending:false}),
      supabase.from("events").select("*").eq("user_id",uid).order("starts_at"),
      supabase.from("health_entries").select("*").eq("user_id",uid).order("entry_date",{ascending:false}),
    ]);
    const firstError=[c,t,b,n,e,h].find(result=>result.error)?.error;
    if(firstError){ setNotice("No pude cargar tus datos. Intenta recargar la página."); setLoading(false); return; }

    let cc=(c.data??[]) as Client[]; let tt=(t.data??[]) as Task[]; let bb=(b.data??[]) as Brand[];
    if(!cc.length){
      const result=await supabase.from("clients").insert(starterClients.map(item=>({...item,user_id:uid}))).select();
      if(result.error){ setNotice("No pude crear los clientes iniciales."); setLoading(false); return; }
      cc=(result.data??[]) as Client[];
    }
    if(!tt.length){
      const result=await supabase.from("tasks").insert(starterTasks.map(item=>({...item,user_id:uid}))).select();
      if(result.error){ setNotice("No pude crear las tareas iniciales."); setLoading(false); return; }
      tt=(result.data??[]) as Task[];
    }
    if(!bb.length){
      const result=await supabase.from("brands").insert(starterBrands.map(item=>({...item,user_id:uid}))).select();
      if(result.error){ setNotice("No pude crear las marcas iniciales."); setLoading(false); return; }
      bb=(result.data??[]) as Brand[];
    }
    setClients(cc); setTasks(tt); setBrands(bb); setNotes((n.data??[]) as Note[]); setEvents((e.data??[]) as EventItem[]); setHealth((h.data??[]) as Health[]); setLoading(false);
  }

  async function insert(table:string,payload:Record<string,unknown>,done:(row:any)=>void){
    const uid=await userId(); if(!uid)return;
    const {data,error}=await supabase.from(table).insert({...payload,user_id:uid}).select().single();
    if(error||!data){ setNotice("No pude guardar el registro."); return; }
    done(data); setNotice("Guardado correctamente.");
  }

  async function remove(table:string,id:string,done:()=>void){
    if(!confirm("¿Eliminar este registro?"))return;
    const uid=await userId(); if(!uid)return;
    const {error}=await supabase.from(table).delete().eq("id",id).eq("user_id",uid);
    if(error)setNotice("No pude eliminar el registro."); else {done();setNotice("Registro eliminado.");}
  }

  async function toggleTask(task:Task){
    const uid=await userId(); if(!uid)return;
    const status=task.status==="Completado"?"Pendiente":"Completado";
    const {error}=await supabase.from("tasks").update({status}).eq("id",task.id).eq("user_id",uid);
    if(error)setNotice("No pude actualizar la tarea."); else setTasks(items=>items.map(item=>item.id===task.id?{...item,status}:item));
  }

  async function logout(){ await supabase.auth.signOut(); window.location.href="/login"; }

  async function callDashboard(payload:Record<string,unknown>){
    const {data:sessionData}=await supabase.auth.getSession();
    const accessToken=sessionData.session?.access_token;
    if(!accessToken)throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    const response=await fetch("/api/dashboard",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${accessToken}`},body:JSON.stringify(payload)});
    const data=await response.json();
    if(!response.ok||data.ok===false)throw new Error(data.error||"Algo salió mal.");
    return data;
  }

  async function sendEmailConfirmed(input:{to:string;subject:string;body:string;cc?:string|null;reply_to_message_id?:string|null}){
    const {data:sessionData}=await supabase.auth.getSession();
    const accessToken=sessionData.session?.access_token;
    if(!accessToken)throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    const response=await fetch("/api/dashboard/send-email",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${accessToken}`},body:JSON.stringify(input)});
    const data=await response.json();
    if(!response.ok||data.ok===false)throw new Error(data.error||"No se pudo enviar el correo.");
    return data;
  }

  function runAssistant(){
    const q=assistant.toLowerCase().trim(); if(!q)return;
    const salami=tasks.filter(t=>(t.area??"").toLowerCase().includes("salami")&&t.status!=="Completado");
    if(q.includes("salami"))setReply(salami.length?`Pendientes de Salami Sibao: ${salami.map(t=>t.title).join("; ")}.`:"Salami Sibao no tiene pendientes abiertos.");
    else if(q.includes("calendario")||q.includes("evento")||q.includes("hoy")){const upcoming=events.filter(e=>new Date(e.starts_at)>=new Date()).slice(0,5);setReply(upcoming.length?`Próximos eventos: ${upcoming.map(e=>`${e.title} (${new Date(e.starts_at).toLocaleString()})`).join("; ")}.`:"No hay eventos próximos registrados.");}
    else if(q.includes("tarea")||q.includes("pendiente")){const p=tasks.filter(t=>t.status!=="Completado");setReply(`Tienes ${p.length} pendientes: ${p.slice(0,6).map(t=>t.title).join("; ")}.`);}
    else if(q.includes("cliente"))setReply(`Tienes ${clients.length} clientes: ${clients.map(c=>c.name).join(", ")}.`);
    else if(q.includes("nota"))setReply(`Tienes ${notes.length} notas guardadas.`);
    else setReply("Puedo consultar clientes, pendientes, calendario, notas y Salami Sibao.");
  }

  const q=search.toLowerCase();
  const visibleClients=useMemo(()=>clients.filter(c=>`${c.name} ${c.brand??""} ${c.service??""}`.toLowerCase().includes(q)),[clients,q]);
  const visibleTasks=useMemo(()=>tasks.filter(t=>`${t.title} ${t.area??""} ${t.status}`.toLowerCase().includes(q)),[tasks,q]);
  const pending=tasks.filter(t=>t.status!=="Completado");

  if(loading)return <main className="grid min-h-screen place-items-center bg-[#090b10] text-zinc-300">Cargando Samy OS…</main>;
  return <main className="min-h-screen bg-[#090b10] text-zinc-100"><div className="flex min-h-screen">
    {menu&&<button className="fixed inset-0 z-30 bg-black/70 lg:hidden" onClick={()=>setMenu(false)}/>}
    <aside className={`fixed inset-y-0 z-40 flex w-72 flex-col border-r border-white/10 bg-[#0d1017] transition-transform lg:static lg:translate-x-0 ${menu?"translate-x-0":"-translate-x-full"}`}>
      <div className="flex h-20 items-center justify-between border-b border-white/10 px-6"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400"><Sparkles size={20}/></div><div><b>Samy OS</b><p className="text-xs text-zinc-500">Centro de operaciones</p></div></div><button className="lg:hidden" onClick={()=>setMenu(false)}><X/></button></div>
      <nav className="flex-1 space-y-1 p-4">{nav.map(([name,Icon])=><button key={name} onClick={()=>{setSection(name);setMenu(false)}} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm ${section===name?"bg-white/10":"text-zinc-400 hover:bg-white/5"}`}><Icon size={19}/>{name}</button>)}</nav>
      <button onClick={logout} className="m-4 flex items-center justify-center gap-2 rounded-xl border border-white/10 p-3 text-sm"><LogOut size={17}/>Cerrar sesión</button>
    </aside>
    <section className="min-w-0 flex-1"><header className="sticky top-0 z-20 flex h-20 items-center gap-4 border-b border-white/10 bg-[#090b10]/90 px-4 backdrop-blur sm:px-8"><button className="lg:hidden" onClick={()=>setMenu(true)}><Menu/></button><div className="flex-1"><p className="text-xs uppercase tracking-[.2em] text-violet-400">Samy OS v1.0</p><h1 className="text-xl font-semibold">{section}</h1></div><label className="hidden max-w-sm flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-4 py-2 sm:flex"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar" className="w-full bg-transparent outline-none"/></label></header>
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">{notice&&<div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-sm">{notice}</div>}
        {section==="Dashboard"&&<Dashboard clients={clients.length} pending={pending.length} completed={tasks.length-pending.length} events={events.length} tasks={tasks} assistant={assistant} setAssistant={setAssistant} reply={reply} run={runAssistant} toggle={toggleTask}/>} 
        {section==="Clientes"&&<Clients items={visibleClients} add={(p:any)=>insert("clients",p,r=>setClients(x=>[...x,r]))} remove={(id:string)=>remove("clients",id,()=>setClients(x=>x.filter(i=>i.id!==id)))}/>} 
        {section==="Pendientes"&&<Tasks items={visibleTasks} add={(p:any)=>insert("tasks",p,r=>setTasks(x=>[...x,r]))} remove={(id:string)=>remove("tasks",id,()=>setTasks(x=>x.filter(i=>i.id!==id)))} toggle={toggleTask}/>} 
        {section==="Calendario"&&<Events items={events} add={(p:any)=>insert("events",p,r=>setEvents(x=>[...x,r].sort((a,b)=>a.starts_at.localeCompare(b.starts_at))))} remove={(id:string)=>remove("events",id,()=>setEvents(x=>x.filter(i=>i.id!==id)))}/>} 
        {section==="Marcas"&&<Brands items={brands} add={(p:any)=>insert("brands",p,r=>setBrands(x=>[...x,r]))} remove={(id:string)=>remove("brands",id,()=>setBrands(x=>x.filter(i=>i.id!==id)))}/>} 
        {section==="Notas"&&<Notes items={notes} add={(p:any)=>insert("notes",p,r=>setNotes(x=>[r,...x]))} remove={(id:string)=>remove("notes",id,()=>setNotes(x=>x.filter(i=>i.id!==id)))}/>} 
        {section==="Salud"&&<HealthView items={health} add={(p:any)=>insert("health_entries",p,r=>setHealth(x=>[r,...x]))} remove={(id:string)=>remove("health_entries",id,()=>setHealth(x=>x.filter(i=>i.id!==id)))}/>}
        {section==="Email"&&<EmailSection call={callDashboard} send={sendEmailConfirmed} notify={setNotice}/>} 
      </div></section>
  </div></main>;
}

const card="rounded-2xl border border-white/10 bg-white/[.035] p-5"; const input="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 outline-none focus:border-violet-400"; const btn="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 font-semibold hover:bg-violet-400";
function Dashboard(p:any){return <><section className="rounded-3xl border border-white/10 bg-gradient-to-br from-violet-500/20 via-[#111520] to-cyan-400/10 p-8"><h2 className="text-3xl font-semibold">Buenas, Samy. El sistema central está activo.</h2><p className="mt-3 text-zinc-400">Clientes, tareas, calendario, marcas, notas y salud en un solo lugar.</p></section><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Clientes",p.clients,Users],["Pendientes",p.pending,ClipboardList],["Completadas",p.completed,CheckCircle2],["Eventos",p.events,CalendarDays]].map(([l,v,I]:any)=><article className={card} key={l}><I className="text-violet-300"/><p className="mt-5 text-zinc-500">{l}</p><p className="text-3xl font-semibold">{v}</p></article>)}</section><section className="grid gap-6 xl:grid-cols-2"><article className={card}><h3 className="text-xl font-semibold">Próximas acciones</h3><div className="mt-4 space-y-2">{p.tasks.slice(0,6).map((t:Task)=><Row key={t.id} title={t.title} sub={`${t.area??"General"} · ${t.status}`} action={<button onClick={()=>p.toggle(t)} className="text-sm text-violet-300">Cambiar</button>}/>)}</div></article><article className={card}><h3 className="text-xl font-semibold">Pregúntale a Samy OS</h3><textarea value={p.assistant} onChange={(e:any)=>p.setAssistant(e.target.value)} className={`${input} mt-4 min-h-28 w-full`} placeholder="Muéstrame los pendientes de Salami Sibao"/><button onClick={p.run} className={`${btn} mt-3 w-full`}><Sparkles size={17}/>Consultar</button>{p.reply&&<p className="mt-4 rounded-xl bg-black/25 p-4 text-sm leading-6">{p.reply}</p>}</article></section></>}
function FormBox({children}:{children:React.ReactNode}){return <div className={`${card} grid gap-3 md:grid-cols-2`}>{children}</div>}
function Row({title,sub,action}:{title:string;sub:string;action:React.ReactNode}){return <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 p-4"><div className="min-w-0 flex-1"><p className="font-medium">{title}</p><p className="truncate text-sm text-zinc-500">{sub}</p></div>{action}</div>}
function Delete({onClick}:{onClick:()=>void}){return <button onClick={onClick} className="rounded-lg p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 size={17}/></button>}
function Clients({items,add,remove}:any){const [name,setName]=useState("");const [contact,setContact]=useState("");return <><FormBox><input className={input} placeholder="Nombre del cliente" value={name} onChange={e=>setName(e.target.value)}/><input className={input} placeholder="Contacto" value={contact} onChange={e=>setContact(e.target.value)}/><button className={`${btn} md:col-span-2`} onClick={()=>{if(name.trim()){add({name:name.trim(),primary_contact:contact||null,status:"Activo",priority:"Media",next_step:"Definir próximo paso"});setName("");setContact("")}}}><Plus size={17}/>Nuevo cliente</button></FormBox><div className="grid gap-4 lg:grid-cols-2">{items.map((c:Client)=><article className={card} key={c.id}><div className="flex justify-between"><h3 className="text-lg font-semibold">{c.name}</h3><Delete onClick={()=>remove(c.id)}/></div><p className="text-sm text-zinc-500">{c.brand??"Sin marca"}</p><p className="mt-4 text-sm">Contacto: {c.primary_contact??"—"}</p><p className="mt-2 text-sm">Servicio: {c.service??"—"}</p><p className="mt-2 text-sm text-zinc-400">{c.next_step??"Sin próximo paso"}</p></article>)}</div></>}
function Tasks({items,add,remove,toggle}:any){const [title,setTitle]=useState("");const [area,setArea]=useState("");return <><FormBox><input className={input} placeholder="Nueva tarea" value={title} onChange={e=>setTitle(e.target.value)}/><input className={input} placeholder="Cliente o área" value={area} onChange={e=>setArea(e.target.value)}/><button className={`${btn} md:col-span-2`} onClick={()=>{if(title.trim()){add({title:title.trim(),area:area||"General",status:"Pendiente",priority:"Media"});setTitle("");setArea("")}}}><Plus size={17}/>Crear tarea</button></FormBox><div className={card}>{items.map((t:Task)=><Row key={t.id} title={t.title} sub={`${t.area??"General"} · ${t.status}`} action={<div className="flex"><button onClick={()=>toggle(t)} className="px-3 text-sm text-violet-300">{t.status==="Completado"?"Reabrir":"Completar"}</button><Delete onClick={()=>remove(t.id)}/></div>}/>)}</div></>}
function Events({items,add,remove}:any){const [title,setTitle]=useState("");const [date,setDate]=useState("");const [location,setLocation]=useState("");return <><FormBox><input className={input} placeholder="Evento" value={title} onChange={e=>setTitle(e.target.value)}/><input className={input} type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}/><input className={`${input} md:col-span-2`} placeholder="Lugar" value={location} onChange={e=>setLocation(e.target.value)}/><button className={`${btn} md:col-span-2`} onClick={()=>{if(title&&date){add({title,starts_at:new Date(date).toISOString(),location:location||null,status:"Programado"});setTitle("");setDate("");setLocation("")}}}><Plus size={17}/>Crear evento</button></FormBox><div className={card}>{items.length?items.map((e:EventItem)=><Row key={e.id} title={e.title} sub={`${new Date(e.starts_at).toLocaleString()} · ${e.location??"Sin lugar"}`} action={<Delete onClick={()=>remove(e.id)}/>}/>):<p className="text-zinc-500">No hay eventos registrados.</p>}</div></>}
function Brands({items,add,remove}:any){const [name,setName]=useState("");const [objective,setObjective]=useState("");return <><FormBox><input className={input} placeholder="Marca" value={name} onChange={e=>setName(e.target.value)}/><input className={input} placeholder="Objetivo" value={objective} onChange={e=>setObjective(e.target.value)}/><button className={`${btn} md:col-span-2`} onClick={()=>{if(name){add({name,type:"Marca",objective:objective||null});setName("");setObjective("")}}}><Plus size={17}/>Crear marca</button></FormBox><div className="grid gap-4 md:grid-cols-3">{items.map((b:Brand)=><article className={card} key={b.id}><div className="flex justify-between"><Store className="text-cyan-300"/><Delete onClick={()=>remove(b.id)}/></div><h3 className="mt-4 font-semibold">{b.name}</h3><p className="text-sm text-zinc-500">{b.type}</p><p className="mt-3 text-sm">{b.objective}</p></article>)}</div></>}
function Notes({items,add,remove}:any){const [body,setBody]=useState("");const [related,setRelated]=useState("");return <><FormBox><textarea className={`${input} min-h-24 md:col-span-2`} placeholder="Escribe una nota" value={body} onChange={e=>setBody(e.target.value)}/><input className={input} placeholder="Relacionado con" value={related} onChange={e=>setRelated(e.target.value)}/><button className={btn} onClick={()=>{if(body){add({body,related_to:related||null,category:"General",priority:"Media"});setBody("");setRelated("")}}}><Plus size={17}/>Guardar nota</button></FormBox><div className="grid gap-4 md:grid-cols-2">{items.map((n:Note)=><article className={card} key={n.id}><div className="flex justify-end"><Delete onClick={()=>remove(n.id)}/></div><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-3 text-sm text-zinc-500">{n.related_to??"General"}</p></article>)}</div></>}
function HealthView({items,add,remove}:any){const [sleep,setSleep]=useState("");const [energy,setEnergy]=useState("");const [mood,setMood]=useState("");const [notes,setNotes]=useState("");return <><FormBox><input className={input} type="number" step="0.5" placeholder="Horas de sueño" value={sleep} onChange={e=>setSleep(e.target.value)}/><input className={input} type="number" min="1" max="10" placeholder="Energía 1-10" value={energy} onChange={e=>setEnergy(e.target.value)}/><input className={input} placeholder="Ánimo" value={mood} onChange={e=>setMood(e.target.value)}/><input className={input} placeholder="Notas" value={notes} onChange={e=>setNotes(e.target.value)}/><button className={`${btn} md:col-span-2`} onClick={()=>{add({entry_date:new Date().toISOString().slice(0,10),sleep_hours:sleep?Number(sleep):null,energy_level:energy?Number(energy):null,mood:mood||null,notes:notes||null});setSleep("");setEnergy("");setMood("");setNotes("")}}><Plus size={17}/>Registrar salud</button></FormBox><div className={card}>{items.length?items.map((h:Health)=><Row key={h.id} title={h.entry_date} sub={`Sueño: ${h.sleep_hours??"—"}h · Energía: ${h.energy_level??"—"}/10 · Ánimo: ${h.mood??"—"}`} action={<Delete onClick={()=>remove(h.id)}/>}/>):<p className="text-zinc-500">No hay registros de salud.</p>}</div></>}

type ComposeState = { to:string; subject:string; body:string; cc:string; reply_to_message_id:string|null };
const emptyCompose:ComposeState = { to:"", subject:"", body:"", cc:"", reply_to_message_id:null };

function EmailSection({call,send,notify}:{call:(payload:Record<string,unknown>)=>Promise<any>; send:(input:any)=>Promise<any>; notify:(msg:string)=>void}){
  const [query,setQuery]=useState("");
  const [results,setResults]=useState<EmailSummary[]>([]);
  const [searching,setSearching]=useState(false);
  const [searched,setSearched]=useState(false);
  const [selected,setSelected]=useState<EmailDetail|null>(null);
  const [reading,setReading]=useState(false);
  const [composing,setComposing]=useState(false);
  const [sending,setSending]=useState(false);
  const [form,setForm]=useState<ComposeState>(emptyCompose);

  async function runSearch(){
    setSearching(true); setSearched(true); setSelected(null);
    try{
      const data=await call({operation:"search_email",query,limit:15});
      setResults(data.emails??[]);
    }catch(error){
      notify(error instanceof Error?error.message:"No pude buscar los correos.");
    }finally{ setSearching(false); }
  }

  async function openEmail(id:string){
    setReading(true);
    try{
      const data=await call({operation:"read_email",message_id:id});
      setSelected(data.email);
    }catch(error){
      notify(error instanceof Error?error.message:"No pude abrir ese correo.");
    }finally{ setReading(false); }
  }

  function startReply(){
    if(!selected)return;
    const fromAddress=selected.from.match(/<([^>]+)>/)?.[1]??selected.from;
    setForm({ to:fromAddress, subject:selected.subject, body:"", cc:"", reply_to_message_id:selected.id });
    setComposing(true);
  }

  function startCompose(){
    setForm(emptyCompose);
    setComposing(true);
  }

  async function handleSend(){
    if(!form.to.trim()||!form.subject.trim()||!form.body.trim()){ notify("Falta destinatario, asunto o el cuerpo del correo."); return; }
    const ok=confirm(`¿Enviar este correo?\n\nPara: ${form.to}\nAsunto: ${form.subject}\n\n${form.body.slice(0,200)}${form.body.length>200?"…":""}`);
    if(!ok)return;
    setSending(true);
    try{
      const data=await send({ to:form.to.trim(), subject:form.subject.trim(), body:form.body, cc:form.cc.trim()||null, reply_to_message_id:form.reply_to_message_id });
      notify(data.message||"Correo enviado.");
      setComposing(false); setForm(emptyCompose);
    }catch(error){
      notify(error instanceof Error?error.message:"No pude enviar el correo.");
    }finally{ setSending(false); }
  }

  return <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
    <div className="space-y-4">
      <div className={`${card} flex gap-3`}>
        <input className={`${input} flex-1`} placeholder="Buscar correos (remitente, asunto, tema)" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void runSearch();}}/>
        <button className={btn} onClick={()=>void runSearch()} disabled={searching}><Search size={17}/>{searching?"Buscando…":"Buscar"}</button>
      </div>
      <button className={`${btn} w-full`} onClick={startCompose}><Plus size={17}/>Redactar correo nuevo</button>
      <div className={card}>
        {!searched&&<p className="text-zinc-500">Busca por remitente, asunto o tema — o deja el campo vacío y busca para ver tus correos más recientes.</p>}
        {searched&&!searching&&!results.length&&<p className="text-zinc-500">No encontré correos con esa búsqueda.</p>}
        <div className="space-y-2">
          {results.map(email=>(
            <button key={email.id} onClick={()=>void openEmail(email.id)} className={`block w-full rounded-xl border border-white/5 bg-black/20 p-4 text-left hover:border-violet-400/40 ${selected?.id===email.id?"border-violet-400/60":""}`}>
              <p className="truncate font-medium">{email.subject||"(sin asunto)"}</p>
              <p className="truncate text-sm text-zinc-500">{email.from}</p>
              <p className="mt-1 truncate text-sm text-zinc-600">{email.snippet}</p>
            </button>
          ))}
        </div>
      </div>
    </div>

    <div className="space-y-4">
      {reading&&<div className={card}><p className="text-zinc-500">Abriendo correo…</p></div>}
      {!reading&&selected&&(
        <div className={card}>
          <h3 className="text-lg font-semibold">{selected.subject||"(sin asunto)"}</h3>
          <p className="mt-2 text-sm text-zinc-500">De: {selected.from}</p>
          <p className="text-sm text-zinc-500">Para: {selected.to}</p>
          <p className="text-sm text-zinc-600">{selected.date}</p>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{selected.body}</p>
          {selected.truncated&&<p className="mt-2 text-xs text-zinc-500">(mensaje truncado)</p>}
          <button className={`${btn} mt-4`} onClick={startReply}><Mail size={17}/>Responder</button>
        </div>
      )}
      {!reading&&!selected&&!composing&&<div className={card}><p className="text-zinc-500">Selecciona un correo de la lista para leerlo aquí.</p></div>}

      {composing&&(
        <div className={card}>
          <h3 className="text-lg font-semibold">{form.reply_to_message_id?"Responder correo":"Correo nuevo"}</h3>
          <div className="mt-4 space-y-3">
            <input className={`${input} w-full`} placeholder="Para" value={form.to} onChange={e=>setForm(f=>({...f,to:e.target.value}))}/>
            <input className={`${input} w-full`} placeholder="CC (opcional)" value={form.cc} onChange={e=>setForm(f=>({...f,cc:e.target.value}))}/>
            <input className={`${input} w-full`} placeholder="Asunto" value={form.subject} onChange={e=>setForm(f=>({...f,subject:e.target.value}))}/>
            <textarea className={`${input} min-h-40 w-full`} placeholder="Escribe tu correo…" value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))}/>
          </div>
          <div className="mt-4 flex gap-3">
            <button className={btn} onClick={()=>void handleSend()} disabled={sending}><Send size={17}/>{sending?"Enviando…":"Enviar (te voy a pedir confirmación)"}</button>
            <button className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-400 hover:bg-white/5" onClick={()=>{setComposing(false);setForm(emptyCompose);}}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  </div>;
}
