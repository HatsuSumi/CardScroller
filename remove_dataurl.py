import json
import os

def remove_data_url_from_json(file_path, overwrite=True):
    """
    删除 JSON 配置文件中的 'dataUrl' 字段。
    :param file_path: JSON 文件路径
    :param overwrite: True = 覆盖原文件；False = 生成备份文件
    """
    if not os.path.exists(file_path):
        print(f"❌ 文件不存在: {file_path}")
        return

    try:
        # 读取 JSON 文件
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # 删除字段
        image_config = data.get("config", {}).get("image", {})
        if "dataUrl" in image_config:
            del image_config["dataUrl"]
            print("✅ 已删除字段: dataUrl")
        else:
            print("⚠️ 文件中没有找到 dataUrl 字段")

        # 确定输出路径
        if overwrite:
            output_path = file_path
        else:
            base, ext = os.path.splitext(file_path)
            output_path = f"{base}_backup{ext}"

        # 保存修改后的文件
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"💾 已保存修改后的文件: {output_path}")

    except json.JSONDecodeError:
        print("❌ 解析 JSON 时出错，请确保文件格式正确。")
    except Exception as e:
        print(f"❌ 出现错误: {e}")


if __name__ == "__main__":
    file_path = input("请输入配置文件路径：").strip()
    overwrite_input = input("是否覆盖原文件？(y/n)：").strip().lower()

    overwrite = overwrite_input == "y"
    remove_data_url_from_json(file_path, overwrite)
