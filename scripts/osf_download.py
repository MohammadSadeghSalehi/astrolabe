"""Download files from the COPS OSF node (5xvwn) by waterbutler path.

usage: python osf_get.py <dest_dir> <wb_path> [<wb_path> ...]
       python osf_get.py <dest_dir> --manifest manifest.txt   # lines: "<wb_path> <filename>"
Resumes / skips files that already exist with the expected size.
"""
import os, sys, time, urllib.request

NODE = "5xvwn"
BASE = f"https://files.de-1.osf.io/v1/resources/{NODE}/providers/osfstorage"


def download(wb_path, dest_dir, name=None, expect=None):
    url = BASE + wb_path
    req = urllib.request.Request(url, headers={"User-Agent": "astrolabe/1.0"})
    with urllib.request.urlopen(req) as r:
        cd = r.headers.get("Content-Disposition", "")
        if name is None:
            name = "unknown"
            for part in cd.split(";"):
                part = part.strip()
                if part.startswith("filename="):
                    name = part.split("=", 1)[1].strip('"')
        total = int(r.headers.get("Content-Length") or 0)
        out = os.path.join(dest_dir, name)
        if os.path.exists(out) and total and os.path.getsize(out) == total:
            print(f"  skip  {name} (already {total/1e6:.1f} MB)")
            return out
        tmp = out + ".part"
        got, t0, last = 0, time.time(), 0.0
        with open(tmp, "wb") as f:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
                got += len(chunk)
                now = time.time()
                if total and now - last > 5:
                    last = now
                    pct = 100 * got / total
                    rate = got / 1e6 / max(now - t0, 1e-9)
                    print(f"  {name}: {pct:5.1f}%  {got/1e6:7.1f}/{total/1e6:.1f} MB  {rate:.1f} MB/s", flush=True)
        os.replace(tmp, out)
        print(f"  done  {name}  {got/1e6:.1f} MB in {time.time()-t0:.0f}s", flush=True)
        return out


def main():
    dest = sys.argv[1]
    os.makedirs(dest, exist_ok=True)
    args = sys.argv[2:]
    jobs = []
    if args and args[0] == "--manifest":
        for line in open(args[1]):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            jobs.append((parts[0], parts[1] if len(parts) > 1 else None))
    else:
        jobs = [(a, None) for a in args]
    for wb, name in jobs:
        try:
            download(wb, dest, name)
        except Exception as e:
            print(f"  FAIL  {wb} {name}: {e}", flush=True)


if __name__ == "__main__":
    main()
