import sys

with open('C:\\Users\\sbtkt\\OneDrive\\Belgeler\\Virel\\core\\processor\\pipeline.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    if i == 205: # Line 206 is index 205
        new_lines.append('                try:\n')
    
    if 205 <= i <= 586: # Lines 206 to 587
        if line.strip(): # if not empty
            new_lines.append('    ' + line)
        else:
            new_lines.append(line)
    elif i == 587: # Line 588 is except Exception as exc:
        new_lines.append('                except asyncio.CancelledError:\n')
        new_lines.append('                    raise\n')
        new_lines.append('                except Exception as loop_exc:\n')
        new_lines.append('                    self.logger.error(f"[{PREFIX_SYS}-041] [Ana Çeviri Döngüsü İçi] -> AKSAMA | Hata: {loop_exc}")\n')
        new_lines.append('                    await asyncio.sleep(max(1.0, self.loop_interval))\n')
        new_lines.append('        except asyncio.CancelledError:\n')
        new_lines.append('            pass\n')
        new_lines.append(line) # original except Exception as exc:
    else:
        new_lines.append(line)

with open('C:\\Users\\sbtkt\\OneDrive\\Belgeler\\Virel\\core\\processor\\pipeline.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
