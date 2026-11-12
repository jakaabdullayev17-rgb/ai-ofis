"""Original office character head. Blender 4.x; outputs ../models/office-head.glb.
Coordinates below use Three.js Y-up, converted to Blender Z-up for authoring.
No scans, external characters or copyrighted likenesses.
"""
import bpy,math,pathlib
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def xyz(p):return (p[0],-p[2],p[1])
def material(name,color,roughness):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness;return m
skin=material('skin',(1,1,1),.64);lips=material('lips',(.51,.24,.20),.65);white=material('sclera',(.77,.75,.69),.30);iris=material('iris',(.11,.17,.14),.32);pupil=material('pupil',(.012,.016,.02),.2);crease=material('crease',(.21,.09,.07),.8)
def mesh(name,verts,faces,mat):
 g=bpy.data.meshes.new(name);g.from_pydata([xyz(v) for v in verts],[],faces);g.update();o=bpy.data.objects.new(name,g);bpy.context.collection.objects.link(o);g.materials.append(mat)
 for p in g.polygons:p.use_smooth=True
 return o
def ellipsoid(name,p,s,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=xyz(p));o=bpy.context.object;o.name=name;o.scale=(s[0],s[2],s[1]);o.data.materials.append(m)
 for q in o.data.polygons:q.use_smooth=True
 return o
def tube(name,pts,r,m):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=2;c.resolution_u=8;s=c.splines.new('BEZIER');s.bezier_points.add(len(pts)-1)
 for b,p in zip(s.bezier_points,pts):b.co=xyz(p);b.handle_left_type='AUTO';b.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);c.materials.append(m);return o
# Anatomical jaw / cheek / forehead profiles. Front is +Z.
rings=[(.09,.045,.04,.040),(.105,.073,.059,.068),(.13,.095,.075,.099),(.16,.108,.09,.112),(.19,.116,.11,.113),(.22,.128,.122,.115),(.25,.136,.13,.121),(.28,.132,.13,.115),(.31,.129,.128,.122),(.35,.131,.123,.12),(.39,.115,.106,.104),(.425,.065,.06,.062),(.438,.005,.005,.005)]
v=[];f=[];N=48
for y,w,back,front in rings:
 for k in range(N):
  a=k*2*math.pi/N;x=math.sin(a)*w;co=math.cos(a);z=co*(front if co>=0 else back)
  if co>0:
   z+=.009*math.exp(-((abs(x)-.073)/.033)**2-((y-.228)/.045)**2)
   z-=.011*math.exp(-((abs(x)-.055)/.028)**2-((y-.278)/.019)**2)
  v.append((x,y,z))
for j in range(len(rings)-1):
 for k in range(N):a=j*N+k;b=j*N+(k+1)%N;f.append((a,b,b+N,a+N))
f.extend([tuple(reversed(range(N))),tuple((len(rings)-1)*N+k for k in range(N))]);o=mesh('sculpted_skull',v,f,skin);mod=o.modifiers.new('Surface continuity','SUBSURF');mod.levels=1
ellipsoid('nose_bridge',(0,.248,.124),(.017,.042,.024),skin);ellipsoid('nose_tip',(0,.214,.147),(.020,.015,.020),skin)
for side in [-1,1]:
 ellipsoid('nose_wing',(side*.018,.208,.134),(.012,.009,.013),skin)
 ellipsoid('nostril',(side*.014,.203,.144),(.006,.003,.004),crease)
 ellipsoid('ear',(side*.135,.247,-.003),(.024,.045,.020),skin)
 tube('ear_fold',[(side*.143,.273,.011),(side*.151,.260,.015),(side*.150,.235,.013),(side*.141,.224,.014)],.004,skin)
 ellipsoid('eye',(side*.054,.275,.117),(.026,.012,.014),white)
 ellipsoid('iris',(side*.054,.275,.129),(.009,.009,.003),iris)
 ellipsoid('pupil',(side*.054,.275,.132),(.004,.005,.0015),pupil)
 tube('upper_lid',[(side*.029,.274,.121),(side*.051,.286,.127),(side*.078,.275,.115)],.0038,skin)
 tube('lower_lid',[(side*.029,.274,.121),(side*.053,.266,.126),(side*.078,.275,.115)],.003,skin)
# Closed relaxed mouth, lip seam and philtrum.
tube('upper_lip',[(-.033,.173,.113),(-.013,.178,.121),(0,.175,.124),(.013,.178,.121),(.033,.173,.113)],.0038,lips)
tube('lower_lip',[(-.031,.172,.114),(0,.167,.123),(.031,.172,.114)],.0045,lips)
tube('lip_seam',[(-.030,.172,.117),(0,.172,.125),(.030,.172,.117)],.0012,crease)
# Convert bevel curves and subdivision to portable mesh geometry.
for ob in list(bpy.context.scene.objects):
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
 if ob.type=='CURVE':bpy.ops.object.convert(target='MESH')
 for mod in list(ob.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
out=pathlib.Path(__file__).resolve().parents[1]/'models'/'office-head.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
print('Saved',out)
