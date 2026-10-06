-- Our own store of sharp satellite tiles (Sentinel-2), written only by the sat10 function, readable by everyone.
insert into storage.buckets (id, name, public) values ('sat10', 'sat10', true) on conflict (id) do nothing;
