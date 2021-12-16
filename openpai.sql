/*
 Navicat Premium Data Transfer

 Source Server         : westlake
 Source Server Type    : MySQL
 Source Server Version : 80027
 Source Host           : localhost:3308
 Source Schema         : openpai

 Target Server Type    : MySQL
 Target Server Version : 80027
 File Encoding         : 65001

 Date: 16/12/2021 21:09:23
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for rules
-- ----------------------------
DROP TABLE IF EXISTS `rules`;
CREATE TABLE `rules`  (
  `rule_id` int NOT NULL AUTO_INCREMENT COMMENT '规则id，自增长',
  `username_match` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '用户名正则匹配式',
  `VC` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT 'VC，用来指示不同的gpu型号',
  `current_priority` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '修改前的优先级',
  `common_occupied_gpu_limit` int NULL DEFAULT NULL COMMENT '普通任务gpu限制数',
  `high_priority_occupied_gpu_limit` int NULL DEFAULT NULL COMMENT '高优先级任务gpu限制数',
  `changed_priority` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '修改后优先级',
  `fail_tips` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '规则提示',
  PRIMARY KEY (`rule_id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 18 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of rules
-- ----------------------------
INSERT INTO `rules` VALUES (1, '.*', NULL, NULL, NULL, NULL, 'retain', NULL);
INSERT INTO `rules` VALUES (2, '.*', NULL, 'oppo', 0, NULL, 'retain', NULL);
INSERT INTO `rules` VALUES (3, '.*', NULL, 'oppo', 10, NULL, 'fail', '普通用户只能提交oppo优先级任务，占用10个GPU！请等待之前任务完成或停止某些任务。');
INSERT INTO `rules` VALUES (4, '.*', '', 'test,default', 0, NULL, 'retain', NULL);
INSERT INTO `rules` VALUES (5, '.*', NULL, 'test,default', 2, NULL, 'oppo', NULL);
INSERT INTO `rules` VALUES (6, '.*', NULL, 'prod', NULL, NULL, 'test', NULL);
INSERT INTO `rules` VALUES (7, '^user_proh$', NULL, NULL, NULL, NULL, 'fail', '您没有提交任务的权限！请联系管理员。');
INSERT INTO `rules` VALUES (13, '^admin$', '', NULL, NULL, NULL, 'retain', NULL);
INSERT INTO `rules` VALUES (14, '^st_yanglinyi$', NULL, NULL, NULL, NULL, 'retain', NULL);
INSERT INTO `rules` VALUES (15, '^fa_minqingkai$', NULL, NULL, NULL, NULL, 'retain', NULL);
INSERT INTO `rules` VALUES (16, '^fa_ouzebin$', NULL, NULL, NULL, NULL, 'retain', NULL);
INSERT INTO `rules` VALUES (17, '^fa_baixuefeng$', NULL, NULL, NULL, NULL, 'retain', NULL);

-- ----------------------------
-- Table structure for token
-- ----------------------------
DROP TABLE IF EXISTS `token`;
CREATE TABLE `token`  (
  `app_token` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of token
-- ----------------------------
INSERT INTO `token` VALUES ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImFkbWluIiwiYXBwbGljYXRpb24iOnRydWUsImpvYlNwZWNpZmljIjpmYWxzZSwiZW5jb2RlZEZyYW1ld29ya05hbWUiOiIiLCJpYXQiOjE2MzkyODUyMjl9.WdaBQrnx2xOKnsO7G1Gqz74As715mjv7-f5MqGixpIQ');

SET FOREIGN_KEY_CHECKS = 1;
