---
layout: post
title: "NFL Sack Predictions using Logistic Regression"
categories: journal
date: 2023-09-21
tags: ['python']
---

### Predicting NFL Sacks with Machine Learning

In the world of the National Football League (NFL), every play carries the potential to change the course of a game. One such game-changing play is the sack, where a quarterback is tackled behind the line of scrimmage before he can throw a forward pass. Predicting when a sack might occur can offer teams a strategic advantage, and with the power of machine learning, this prediction becomes feasible.

In this post, we'll walk through a Python notebook that leverages NFL play-by-play data to predict the occurrence of sacks. 

---

#### 1. Setting the Stage: Installing and Importing Libraries

The first step involves setting up the necessary Python libraries. Among these are:
- `nfl_data_py`: A unique package tailored for fetching NFL data.
- `pandas`, `numpy`: For data manipulation.
- `matplotlib`, `seaborn`: For visualization.
- `sklearn`, `xgboost`: For machine learning.

---

#### 2. Fetching the Data

The NFL play-by-play data for the years 2020, 2021, and 2022 is loaded using the `import_pbp_data` function from the `nfl_data_py` package.

---

#### 3. Data Cleaning and Preprocessing

The dataset undergoes a cleaning process, filtering out non-passing plays and plays labeled as "no_play". This ensures that the data used for modeling is relevant and noise-free.

---

#### 4. Exploratory Data Analysis (EDA)

Visualization plays a crucial role in understanding the dataset. Through EDA:
- The distribution of sacks in the dataset is visualized to understand the balance between plays resulting in sacks and those that don't.
- Insights are drawn on how the number of pass rushers or the number of defenders in the box can influence the likelihood of a sack.

---

#### 5. Feature Engineering

The power of a machine learning model often lies in the features used. In this notebook:
- A new feature called 'obvious_pass' is introduced, highlighting scenarios where a passing play is highly anticipated.
- The 'down' variable (1st down, 2nd down, etc.) is treated as a categorical feature, making it more digestible for the models.

---

#### 6. Modeling and Evaluation

Three machine learning models are trained on the data:
1. **Logistic Regression**
2. **Random Forest**
3. **XGBoost**

Each model's performance is evaluated using the Brier Score, which measures the mean squared difference between the predicted probabilities and the actual outcomes.

---

In summary, the notebook offers a comprehensive approach to predicting sacks in NFL games using machine learning. By leveraging historical play-by-play data, cleaning it, engineering meaningful features, and employing robust models, we can make informed predictions that could potentially change the way teams strategize in real-time.

---

*Note: This is a summarized version of the notebook's content. For detailed code and in-depth explanations, it's advisable to refer to the original notebook.*

