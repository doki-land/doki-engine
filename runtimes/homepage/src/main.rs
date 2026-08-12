use doki_engine::DokiEngine;
use std::fs;
use std::path::Path;

fn main() {
    // 初始化 Doki Engine
    let engine = DokiEngine::new();
    
    // 读取配置文件
    let config = fs::read_to_string("doki.toml").expect("Failed to read doki.toml");
    
    // 处理配置
    engine.load_config(&config).expect("Failed to load config");
    
    // 构建站点
    engine.build().expect("Failed to build site");
    
    println!("Site built successfully!");
}
