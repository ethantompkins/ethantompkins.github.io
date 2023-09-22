---
layout: post
title: "Predicting NFL Sacks with Logistic Regression"
categories: journal
date: 2023-09-21
tags: ['python']
---

In the National Football League (NFL), every play has a possibility of changing the game. One such game-changing play is the sack, where a quarterback is tackled behind the line of scrimmage before he can throw a forward pass. Using logistic regression, we can make a prediction on whethere a sack is likely to happen based on different circumstances within a game.

---

#### 1. Setting the Stage: Installing and Importing Libraries

The first step involves setting up the necessary Python libraries. Among these are:
- `nfl_data_py`: A  package for fetching NFL data.
- `pandas`, `numpy`: For data manipulation.
- `matplotlib`, `seaborn`: For visualization.
- `sklearn`, `xgboost`: For machine learning.

---

#### 2. Fetching the Data

For this we are using NFL play-by-play data from the years 2020, 2021, and 2022.
```python
pbp = nfl.import_pbp_data([2020, 2021, 2022])
```
---

#### 3. Data Cleaning and Preprocessing

The dataset undergoes a cleaning process, filtering out non-passing plays and plays labeled as "no_play". This ensures that the data used for modeling is relevant and noise-free.
```python
pbp_clean = pbp[(pbp['pass'] == 1) & (pbp['play_type'] != "no_play")]
```
---

#### 4. Exploratory Data Analysis (EDA)

Visualization plays a crucial role in understanding the dataset. Through EDA:
- The distribution of sacks in the dataset is visualized using a count plot to understand the balance between plays resulting in sacks and those that don't. We can also look at the amount of sacks that occur each down.
<div style="display: flex; justify-content: space-between;">

<img src="{{ site.github.url }}/images/sack_prediction_lr/sack_count.png" alt="Sack count" style="width: 50%; max-width: 900px;">
<img src="{{ site.github.url }}/images/sack_prediction_lr/sack_count_per_down.png" alt="Sack count per down" style="width: 50%; max-width: 900px;">

</div>
- Insights are drawn on how the number of pass rushers or the number of defenders in the box can influence the likelihood of a sack.

<div style="display: flex; justify-content: space-between;">

<img src="{{ site.github.url }}/images/sack_prediction_lr/sack_count_per_defenderinbox.png" alt="Sack count per defender in box" style="width: 50%; max-width: 900px;">
<img src="{{ site.github.url }}/images/sack_prediction_lr/sack_count_per_pass_rusher.png" alt="Sack count per pass rusher" style="width: 50%; max-width: 900px;">

</div>

---

#### 5. Feature Engineering

Looking at the data, we think about features we can add to make predicting a sack easier. From our EDA, a sack is most likely to happen on third down. From this we can define an "obvious pass" variable to help with analysis. An obvious pass is going to be one where it is third down and there is atleast 6 yards to go for a first down. 

```python 
pbp_clean['obvious_pass'] = np.where((pbp_clean['down'] == 3) & (pbp_clean['ydstogo'] >= 6), 1,0)
```

Next we can create a 'down' variable (1st down, 2nd down, etc.). This is treated as a categorical feature, making it more digestible for the models.

```python 
df['down'] = df['down'].astype('category')
df_no_ids = df.drop(columns = ['game_id', 'play_id', 'name', 'season'])
df_no_ids = pd.get_dummies(df_no_ids, columns = ['down'])
```

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

*Link to the full github repo located [here]*

[here]: https://github.com/ethantompkins/jupyter-notebooks-fb/blob/main/logistic_regression_sack_prediction.ipynb

