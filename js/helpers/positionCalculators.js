/**
 * positionCalculators - 位置计算工具函数
 * 纯函数工具，处理坐标转换计算
 * 
 * 负责像素位置与滚动距离之间的线性映射转换，基于图片原始宽度和实际显示宽度进行比例计算
 * 
 * 当前被使用的模块：
 * - ImageService (services/business/ImageService.js) - 计算替换图片的默认结束位置
 * - BusinessOrchestrationService (services/system/BusinessOrchestrationService.js) - 计算上传图片的默认结束位置
 * - DisplayCoordinatorService (services/ui/DisplayCoordinatorService.js) - 计算锁定时的默认结束位置
 * - PositionSelectorService (services/modal/PositionSelectorService.js) - 坐标转换计算
 * - PositionSliderService (services/ui/PositionSliderService.js) - 滑块值转换
 * 
 * 当前依赖的模块：
 * - 无（纯函数，无外部依赖）
 */

/**
 * 将像素位置转换为滚动距离
 * 
 * 基于单阶段线性映射：将图片原始像素坐标映射到实际显示区域的滚动距离。
 * 映射关系：pixelPosition (0 → imageWidth) → scrollDistance (0 → mainImageWidth)
 * 
 * @param {number} pixelPosition - 图片原始像素位置
 * @param {number} imageWidth - 图片原始宽度（像素）
 * @param {number} mainImageWidth - 主显示区域图片实际宽度（缩放后）
 * @returns {number} 滚动距离
 * @throws {Error} 当参数无效时（非数字、NaN、Infinity、pixelPosition<0、imageWidth≤0、mainImageWidth≤0）
 */
export function convertPixelPositionToScrollDistance(pixelPosition, imageWidth, mainImageWidth) {
    // Fail Fast: 验证参数有效性
    if (typeof pixelPosition !== 'number' || !isFinite(pixelPosition) || pixelPosition < 0) {
        throw new Error(`convertPixelPositionToScrollDistance: pixelPosition must be a non-negative finite number`);
    }
    if (typeof imageWidth !== 'number' || !isFinite(imageWidth) || imageWidth <= 0) {
        throw new Error(`convertPixelPositionToScrollDistance: imageWidth must be a positive finite number`);
    }
    if (typeof mainImageWidth !== 'number' || !isFinite(mainImageWidth) || mainImageWidth <= 0) {
        throw new Error(`convertPixelPositionToScrollDistance: mainImageWidth must be a positive finite number`);
    }

    // 🎯 单阶段线性映射：scrollDistance = (pixelPosition / imageWidth) * mainImageWidth
    return (pixelPosition / imageWidth) * mainImageWidth;
}

/**
 * 将滚动距离转换为像素位置
 * 
 * 基于单阶段线性映射的反向计算：将实际显示区域的滚动距离映射回图片原始像素坐标。
 * 映射关系：scrollDistance (0 → mainImageWidth) → pixelPosition (0 → imageWidth)
 * 
 * @param {number} scrollDistance - 滚动距离
 * @param {number} imageWidth - 图片原始宽度（像素）
 * @param {number} mainImageWidth - 主显示区域图片实际宽度（缩放后）
 * @returns {number} 图片原始像素位置（不超过 imageWidth）
 * @throws {Error} 当参数无效时（非数字、NaN、Infinity、scrollDistance<0、imageWidth≤0、mainImageWidth≤0）
 */
export function convertScrollDistanceToPixelPosition(scrollDistance, imageWidth, mainImageWidth) {
    // Fail Fast: 验证参数有效性
    if (typeof scrollDistance !== 'number' || !isFinite(scrollDistance) || scrollDistance < 0) {
        throw new Error(`convertScrollDistanceToPixelPosition: scrollDistance must be a non-negative finite number`);
    }
    if (typeof imageWidth !== 'number' || !isFinite(imageWidth) || imageWidth <= 0) {
        throw new Error(`convertScrollDistanceToPixelPosition: imageWidth must be a positive finite number`);
    }
    if (typeof mainImageWidth !== 'number' || !isFinite(mainImageWidth) || mainImageWidth <= 0) {
        throw new Error(`convertScrollDistanceToPixelPosition: mainImageWidth must be a positive finite number`);
    }

    // 🎯 单阶段线性映射反向计算：pixelPosition = (scrollDistance / mainImageWidth) * imageWidth
    const pixelPosition = (scrollDistance / mainImageWidth) * imageWidth;
    // 确保不超过图片宽度
    return Math.min(pixelPosition, imageWidth);
}

/**
 * 计算图片滚动的默认结束位置
 * 
 * 目标：计算图片右边缘贴合视口右边缘时对应的原始像素位置。
 * 适用于图片上传后的默认位置初始化。
 * 
 * 计算流程：
 * 1. 计算缩放后的图片宽度 (mainImageWidth = imageWidth * scalingRatio)
 * 2. 计算理论滚动结束位置 (theoreticalMainEndPos = mainImageWidth - viewportWidth)
 * 3. 转换为原始像素位置 (endPosition = theoreticalMainEndPos / mainImageWidth * imageWidth)
 * 4. 确保非负值 (Math.max(endPosition, 0))
 * 
 * @param {number} imageWidth - 图片原始宽度（像素）
 * @param {number} scalingRatio - 图片缩放比例（>0）
 * @param {number} viewportWidth - 视口宽度（像素，>0）
 * @returns {number} 默认结束位置（原始像素坐标，非负）
 * @throws {Error} 当参数无效时（非数字、NaN、Infinity、任意参数≤0）
 */
export function calculateDefaultEndPosition(imageWidth, scalingRatio, viewportWidth) {
    // Fail Fast: 验证参数有效性
    if (typeof imageWidth !== 'number' || !isFinite(imageWidth) || imageWidth <= 0) {
        throw new Error(`calculateDefaultEndPosition: imageWidth must be a positive finite number`);
    }
    if (typeof scalingRatio !== 'number' || !isFinite(scalingRatio) || scalingRatio <= 0) {
        throw new Error(`calculateDefaultEndPosition: scalingRatio must be a positive finite number`);
    }
    if (typeof viewportWidth !== 'number' || !isFinite(viewportWidth) || viewportWidth <= 0) {
        throw new Error(`calculateDefaultEndPosition: viewportWidth must be a positive finite number`);
    }
    
    // 1. 计算缩放后的图片宽度（保持浮点数精度）
    const mainImageWidth = imageWidth * scalingRatio;
    
    // 2. 计算理论滚动结束位置（图片右边缘贴合视口右边缘）
    const theoreticalMainEndPos = mainImageWidth - viewportWidth;
    
    // 3. 转换为原始像素位置
    const endPosition = (theoreticalMainEndPos / mainImageWidth) * imageWidth;
    
    // 4. 确保非负值（当图片比视口小时可能为负）
    return Math.max(endPosition, 0);
}
