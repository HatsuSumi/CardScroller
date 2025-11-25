/**
 * PPIExtractorService - PPI信息提取服务
 * 专门负责从图片文件中提取PPI（Pixels Per Inch）信息，支持JPEG(EXIF/TIFF)和PNG(pHYs)格式，提供PPI数据解析和格式化功能
 * 
 * 当前被使用的模块：
 * - ImageInfoModalService (modal/ImageInfoModalService.js) - 提取图片PPI信息用于显示
 * - ConfigService (business/ConfigService.js) - 通过currentPPIInfo属性获取PPI信息用于配置导出
 * - PerformanceReportPage (ui/PerformanceReportPage.js) - 通过currentPPIInfo属性获取PPI信息用于性能报告显示
 * - ImageInfoPanel (components/performance/ImageInfoPanel.js) - 使用formatPPIInfo方法格式化PPI显示文本
 * 
 * 当前依赖的模块：
 * - 无外部依赖 (纯业务处理服务)
 */
export class PPIExtractorService {
    /**
     * 构造函数
     * 初始化PPI信息为null，在每次提取后会更新此属性
     */
    constructor() {
        this.currentPPIInfo = null;
        // 复用TextDecoder实例，避免在循环中重复创建（性能优化）
        this._textDecoder = new TextDecoder();
    }
    
    // 静态常量：PNG文件签名（性能优化：避免重复创建数组）
    static PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    
    // 静态常量：单位转换系数（性能优化+可维护性）
    static INCHES_PER_METER = 39.3701; // 1米包含的英寸数
    static CM_PER_INCH = 2.54; // 1英寸包含的厘米数

    /**
     * 异步提取PPI信息
     * @param {File|Blob} fileData 文件数据（File或Blob对象）
     * @returns {Promise<{xPPI: number, yPPI: number} | null>} PPI信息对象，包含xPPI和yPPI属性；如果提取失败、图片不包含PPI信息或文件格式不支持则返回null
     */
    async extractPPI(fileData) {
        // 注意：这里使用try-catch是合理的，因为：
        // 1. PPI提取失败是预期行为（很多图片本身就没有PPI元数据）
        // 2. 二进制数据解析可能遇到各种边界情况（损坏的文件、非标准格式等）
        // 3. 返回null是正常的业务逻辑，不是错误隐藏
        try {
            this.currentPPIInfo = null;
            
            // 检查 fileData 是否是有效的 Blob/File 对象
            if (!fileData || !(fileData instanceof Blob)) {
                return null;
            }
            
            // 性能优化：只读取文件头部（PPI信息通常在前64KB内）
            // 避免大文件（如40000x4500px图片）占用过多内存
            const headerSize = 65536; // 64KB
            const headerBlob = fileData.slice(0, Math.min(headerSize, fileData.size));
            
            // 创建FileReader读取文件头部
            const reader = new FileReader();
            const arrayBuffer = await new Promise((resolve, reject) => {
                reader.onload = e => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsArrayBuffer(headerBlob);
            });

            if (fileData.type === 'image/jpeg') {
                // 解析JPEG文件的PPI信息
                this.currentPPIInfo = this._parseJpegPPI(arrayBuffer);
            } else if (fileData.type === 'image/png') {
                // 解析PNG文件的PPI信息
                this.currentPPIInfo = this._parsePngPPI(arrayBuffer);
            }

            return this.currentPPIInfo;
        } catch (error) {
            console.warn('⚠️ PPI信息提取失败:', error);
            return null;
        }
    }

    /**
     * 获取格式化的PPI信息，用于UI显示
     * @param {{xPPI: number, yPPI: number}|null} ppiInfo PPI信息对象，可为null
     * @returns {{x: string, y: string}} 格式化的PPI信息，包含x和y两个字符串属性（带单位或提示文本）
     */
    formatPPIInfo(ppiInfo) {
        // Fail Fast：验证ppiInfo是否包含有效的数字类型PPI值（拒绝NaN、Infinity、非数字类型）
        if (ppiInfo 
            && typeof ppiInfo.xPPI === 'number' 
            && typeof ppiInfo.yPPI === 'number'
            && Number.isFinite(ppiInfo.xPPI) 
            && Number.isFinite(ppiInfo.yPPI)
            && ppiInfo.xPPI > 0
            && ppiInfo.yPPI > 0) {
            return {
                x: `${ppiInfo.xPPI} PPI`,
                y: `${ppiInfo.yPPI} PPI`
            };
        }
        
        // 图片不包含 PPI 元数据时，如实告知用户
        return {
            x: '未检测到PPI信息',
            y: '未检测到PPI信息'
        };
    }

    /**
     * 解析JPEG文件的PPI信息
     * @param {ArrayBuffer} arrayBuffer 文件的ArrayBuffer
     * @returns {{xPPI: number, yPPI: number} | null}
     * @private
     */
    _parseJpegPPI(arrayBuffer) {
        const dataView = new DataView(arrayBuffer);
        
        try {
            // 检查JPEG标识（0xFFD8 = SOI, Start Of Image）
            if (dataView.getUint16(0) !== 0xFFD8) {
                return null;
            }

            let offset = 2;
            let marker;

            // 查找APP1段（EXIF数据段）
            while (offset < dataView.byteLength) {
                marker = dataView.getUint16(offset);
                
                const segmentLength = dataView.getUint16(offset + 2);
                
                if (marker === 0xFFE1) { // APP1段（Application Marker 1，用于存储EXIF数据）
                    // 性能优化：使用复用的TextDecoder实例
                    const exifString = this._textDecoder.decode(
                        new Uint8Array(arrayBuffer, offset + 4, 4)
                    );
                    
                    if (exifString === 'Exif') { // EXIF标识字符串
                        // 找到EXIF数据，解析TIFF格式
                        // offset + 10 = 跳过段标识(2) + 段长度(2) + "Exif\0\0"(6) = 10字节
                        const tiffOffset = offset + 10;
                        return this._parseTiffPPI(dataView, tiffOffset);
                    }
                }
                
                if (marker === 0xFFDA) { // SOS段（Start Of Scan，图像数据开始）
                    break;
                }
                
                offset += 2 + segmentLength;
            }
        } catch (error) {
            console.warn('⚠️ JPEG PPI解析错误:', error);
        }

        return null;
    }

    /**
     * 读取uint16值（考虑字节序）
     * @param {DataView} dataView 数据视图
     * @param {number} offset 偏移量
     * @param {boolean} isLittleEndian 是否为小端序
     * @returns {number} uint16值
     * @private
     */
    _readUint16(dataView, offset, isLittleEndian) {
        return dataView.getUint16(offset, isLittleEndian);
    }

    /**
     * 读取uint32值（考虑字节序）
     * @param {DataView} dataView 数据视图
     * @param {number} offset 偏移量
     * @param {boolean} isLittleEndian 是否为小端序
     * @returns {number} uint32值
     * @private
     */
    _readUint32(dataView, offset, isLittleEndian) {
        return dataView.getUint32(offset, isLittleEndian);
    }

    /**
     * 读取TIFF有理数（Rational类型：分子/分母）
     * @param {DataView} dataView 数据视图
     * @param {number} tiffOffset TIFF数据起始偏移
     * @param {number} entryOffset 当前IFD条目偏移
     * @param {boolean} isLittleEndian 是否为小端序
     * @returns {number|null} 计算后的有理数值，如果分母为0则返回null
     * @private
     */
    _readTiffRational(dataView, tiffOffset, entryOffset, isLittleEndian) {
        const valueOffset = this._readUint32(dataView, entryOffset + 8, isLittleEndian);
        const numerator = this._readUint32(dataView, tiffOffset + valueOffset, isLittleEndian);
        const denominator = this._readUint32(dataView, tiffOffset + valueOffset + 4, isLittleEndian);
        
        // Fail Fast：检测除零错误
        if (denominator === 0) {
            return null;
        }
        
        return numerator / denominator;
    }

    /**
     * 验证PPI结果是否有效
     * @param {number} xPPI X轴PPI值
     * @param {number} yPPI Y轴PPI值
     * @returns {boolean} 是否为有效的PPI值（有限正数）
     * @private
     */
    _isValidPPIResult(xPPI, yPPI) {
        return Number.isFinite(xPPI) && Number.isFinite(yPPI) && xPPI > 0 && yPPI > 0;
    }

    /**
     * 解析TIFF格式的PPI信息
     * @param {DataView} dataView 数据视图
     * @param {number} tiffOffset TIFF数据偏移
     * @returns {{xPPI: number, yPPI: number} | null}
     * @private
     */
    _parseTiffPPI(dataView, tiffOffset) {
        try {
            // 读取TIFF头（字节序标识）
            const byteOrder = dataView.getUint16(tiffOffset);
            // Fail Fast：验证字节序标识是否有效
            // 0x4949 = "II" (Intel, 小端序), 0x4D4D = "MM" (Motorola, 大端序)
            if (byteOrder !== 0x4949 && byteOrder !== 0x4D4D) {
                return null; // 无效的TIFF字节序，拒绝处理
            }
            const isLittleEndian = byteOrder === 0x4949;
            
            // 读取第一个IFD（Image File Directory）偏移
            const ifdOffset = this._readUint32(dataView, tiffOffset + 4, isLittleEndian);
            
            // 读取IFD条目数量
            const numEntries = this._readUint16(dataView, tiffOffset + ifdOffset, isLittleEndian);
            
            let xResolution = null;
            let yResolution = null;
            let resolutionUnit = 2; // 默认为英寸（2=inch, 3=cm）
            
            // 遍历IFD条目
            for (let i = 0; i < numEntries; i++) {
                const entryOffset = tiffOffset + ifdOffset + 2 + (i * 12);
                const tag = this._readUint16(dataView, entryOffset, isLittleEndian);
                
                if (tag === 0x011A) { // XResolution
                    xResolution = this._readTiffRational(dataView, tiffOffset, entryOffset, isLittleEndian);
                    if (xResolution === null) {
                        continue; // 跳过除零错误的无效数据
                    }
                } else if (tag === 0x011B) { // YResolution
                    yResolution = this._readTiffRational(dataView, tiffOffset, entryOffset, isLittleEndian);
                    if (yResolution === null) {
                        continue; // 跳过除零错误的无效数据
                    }
                } else if (tag === 0x0128) { // ResolutionUnit
                    resolutionUnit = this._readUint16(dataView, entryOffset + 8, isLittleEndian);
                }
                
                // 性能优化：找到所有需要的标签后立即退出（避免不必要的循环）
                if (xResolution !== null && yResolution !== null && resolutionUnit !== 2) {
                    break;
                }
            }
            
            if (xResolution && yResolution) {
                // 转换为PPI（如果单位是厘米，需要转换为英寸）
                if (resolutionUnit === 3) { // 3 = 厘米单位
                    // 使用静态常量替换魔数（性能优化+可维护性）
                    xResolution *= PPIExtractorService.CM_PER_INCH;
                    yResolution *= PPIExtractorService.CM_PER_INCH;
                }
                
                const xPPI = Math.round(xResolution);
                const yPPI = Math.round(yResolution);
                
                // Fail Fast：验证结果是否为有效的正整数（拒绝Infinity、NaN、负数、零）
                if (!this._isValidPPIResult(xPPI, yPPI)) {
                    return null;
                }
                
                return { xPPI, yPPI };
            }
        } catch (error) {
            console.warn('⚠️ TIFF PPI解析错误:', error);
        }
        
        return null;
    }

    /**
     * 解析PNG文件的PPI信息
     * @param {ArrayBuffer} arrayBuffer 文件的ArrayBuffer
     * @returns {{xPPI: number, yPPI: number} | null}
     * @private
     */
    _parsePngPPI(arrayBuffer) {
        const dataView = new DataView(arrayBuffer);
        
        try {
            // 检查PNG文件魔数签名（使用静态常量，性能优化）
            // 完整签名：89 50 4E 47 0D 0A 1A 0A（对应 "\x89PNG"）
            for (let i = 0; i < 8; i++) {
                if (dataView.getUint8(i) !== PPIExtractorService.PNG_SIGNATURE[i]) {
                    return null;
                }
            }

            let offset = 8; // 跳过PNG文件头（8字节）
            
            // 查找pHYs块（Physical pixel dimensions，物理像素尺寸）
            // 性能优化：更精确的边界检查（至少需要12字节：4长度+4类型+4CRC）
            while (offset + 12 <= dataView.byteLength) {
                const chunkLength = dataView.getUint32(offset);
                
                // Fail Fast：检测异常的chunk长度（防止损坏的PNG文件导致问题）
                if (chunkLength > dataView.byteLength || chunkLength > 10000000) {
                    break; // 异常大的chunk（>10MB），可能是损坏的文件
                }
                
                // 性能优化：使用复用的TextDecoder实例
                const chunkType = this._textDecoder.decode(
                    new Uint8Array(arrayBuffer, offset + 4, 4)
                );
                
                if (chunkType === 'pHYs') { // pHYs = Physical pixel dimensions
                    // pHYs块包含像素每单位信息（9字节：4字节X + 4字节Y + 1字节单位）
                    const xPixelsPerUnit = dataView.getUint32(offset + 8);
                    const yPixelsPerUnit = dataView.getUint32(offset + 12);
                    const unitSpecifier = dataView.getUint8(offset + 16);
                    
                    if (unitSpecifier === 1) { // 1 = 米单位（0 = 无单位）
                        // 转换为PPI（使用静态常量，性能优化+可维护性）
                        const xPPI = Math.round(xPixelsPerUnit / PPIExtractorService.INCHES_PER_METER);
                        const yPPI = Math.round(yPixelsPerUnit / PPIExtractorService.INCHES_PER_METER);
                        
                        // Fail Fast：验证结果是否为有效的正整数（拒绝Infinity、NaN、负数、零）
                        if (!this._isValidPPIResult(xPPI, yPPI)) {
                            return null;
                        }
                        
                        return { xPPI, yPPI };
                    }
                    break;
                }
                
                // 移动到下一个chunk
                // PNG chunk结构：4字节(长度) + 4字节(类型) + N字节(数据) + 4字节(CRC校验)
                offset += 4 + 4 + chunkLength + 4;
            }
        } catch (error) {
            console.warn('⚠️ PNG PPI解析错误:', error);
        }
        
        return null;
    }
}

